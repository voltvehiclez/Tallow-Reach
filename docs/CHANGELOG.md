# Changelog

Newest first. Every AI session adds a short entry when it changes the project, so the
next assistant (which has no memory of earlier chats) can see what happened and why.

Entry format: date, a one-line title, then what changed, which files, and anything
the next person must know (save version, rebuild needed, known issues).

**How this file stays a useful size**

- This file holds the newest entries in full, then the **Older entries** index at the bottom:
  one line for every entry that has been moved to [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md).
  Read the entries here and the index; open the archive only when the index shows something
  relevant to the task (the archive has the full text, nothing was shortened).
- **Rule:** this file holds **at most 10 full entries**. When adding an entry leaves more than 10, move the
  oldest ones to the top of the archive (word for word, newest first) so exactly 10 remain, and add one index
  line for each entry moved, at the top of the index. Do this in the same change that adds the new entry.
  `tests/docs.test.mjs` fails if there are more than 10, or if the index and the archive disagree.
- Never delete an entry. History is only ever moved.

---

## 2026-11-21: Roll rate restored (easing kept); click-to-place works anywhere on the Outfitting panel

- **Roll:** `FLIGHT.rollFactor` back to 3.75 (the pre-cut 250% rate) at the
  owner's call — the **ease in/out ramp stays**, and was the part that helped.
- **Outfitting click-place:** pick-up-then-click (the inventory-slot style of
  placing, as opposed to drag-and-drop) only honoured clicks inside a module
  group card; clicking the big panel's viewer/header areas silently did
  nothing. A held module now fits its left-most empty bay when clicked
  anywhere on the Outfitting panel, matching the drag path. Step 5 of the
  station UI flow test clicks the bare panel and fits.

Files: `src/data/ships.js`, `src/ui/menu.js`, tests, docs. No save change.
Rebuild `game/tallow-reach.html`; `npm test`.

## 2026-11-21: Roll easing, cross-pocket waypoints removed, beacon named, panel-wide outfitting drops

- **Roll ease in/out:** the shared model ramps the roll stick
  (`FLIGHT.rollRampRate` 4/s, ~0.25 s to full rate, same bleed-off on release)
  for the player, banking NPCs and Dane's barrel rolls alike — no more
  snap-on/snap-off rotation. Golden test replica and combat fixture updated.
- **No fake local waypoints:** `missionWaypoints` no longer plants a marker
  1 km away inside your current pocket for a station in another pocket
  (Border Signal's "Meridian Station, 5 km" inside Kestrel Hollow).
  Cross-pocket destinations live on the starmap rings only; in-pocket
  waypoints (courses, signals, authored points) are unchanged.
- **Starmap glow simplified:** destination nodes no longer draw an extra ring
  circle — the dot keeps its own colour and wears the mission-colour glow,
  exactly like the ship UI / N-menu objective markers.
- **Mission items are findable:** a mission crate is labelled by its item
  name (**Beacon**, not "Crate") in the floating label and the target lock,
  with the mission's objective glow it already computed. (The beacon crate
  itself was verified present and amber at the wreck; it was indistinguishable
  in the loot pile, not missing.)
- **Outfitting:** dropping a module anywhere on the big left panel now fits
  its left-most bay reliably — the group is read from the module's own data
  (not the tile dataset), the handler honours where the drag was hovering if
  the release hit-test lands on an overlay, and `finishStationDrag` is
  exported and covered by a real fitting test.

Files: `src/sim/flight-model.js`, `src/data/ships.js`, `src/sim/npc-pilot.js`,
`src/ui/{mission-hud,starmap,hud,menu}.js`, `src/sim/targeting.js`,
`src/styles.css`, tests, docs. No save change.
Rebuild `game/tallow-reach.html`; `npm test`.

## 2026-11-21: Roll cut by 25% (sickening at full speed)

`FLIGHT.rollFactor` 3.75 → 2.8125 globally (player and NPC alike), after the
owner found the 250% roll nauseating. Yaw and pitch unchanged. Recorded
fixtures and the axis-ratio test updated; no save change.

## 2026-11-21: Mission destinations glow on the starmap; ambushers stay "Unmarked" until they attack

- **Warp-to glow:** `missionTravelTargets` (`ui/mission-hud.js`) lists the
  pockets active missions currently want the pilot in (same rule as the
  in-space Waypoint labels, hand-in included), and the starmap rings them in
  the mission's own colour — the destination **system** on the galaxy chart
  (including the current system: Meridian Station → Kestrel Hollow rings
  Meridian) and the destination **pocket** on the system chart. Arriving puts
  it out; warping away brings it back, since it is recomputed from live
  mission state at every render.
- **Face-off identity:** a ship on `prowl` (First Sortie's ambushers during
  the parley) now presents as **Unmarked** with a neutral grey reticle
  (`.mk.u`) everywhere its name or marker is drawn — floating label, target
  lock (`lockName`), marker tone (`markerStyle`). The moment the role drops
  (dialogue ends or anyone shoots), the same ship is its true self again:
  "Newbie Raider", hostile red. Display only; no AI or save change.

Files: `src/ui/{mission-hud,starmap,hud,target-display}.js`,
`src/sim/targeting.js`, `src/styles.css`, tests, docs. No save change.
Rebuild `game/tallow-reach.html`; `npm test`.

## 2026-11-21: NPCs bank to turn; Dane barrel-rolls the chase course

Following the axis-rate change, NPC pilots now use the fast axes:
`sim/npc-pilot.js` banks — when the aim point sits more than
`AI_FLIGHT.pilotBankAbove` (0.3 rad) off the nose, it rolls (fastest axis) to
swing the target into the pitch plane and pitches onto it, reserving slow yaw
for fine aim. Test (j) in `tests/flight-model.test.mjs` shows a raider on a
dead-side target in ~3.5 s where yaw alone needs at least ~4.3 s, banked past
90 degrees on the way; test (d)'s turn cap now reads the pitch axis. Combat
will feel snappier: enemies get their guns on you sooner (their damage numbers
are unchanged). In First Sortie, Dane's 10 km chase course authors two
barrel rolls (`roll: 360` / `-360` on legs in `data/flight-courses.js`, flown
across the leg by `flyCourse` via the pilot's `rollStick`) — showmanship only:
course waypoints and the destination are exactly where they were, and test (k)
pins that the roll fields ride along without moving a single point. The combat
8b fixture was re-recorded and diffed (player pose unchanged).

Files: `src/sim/{npc-pilot,enemy-flight,flight-course}.js`,
`src/data/{enemy-ai,flight-courses}.js`, tests, docs. No save change.
Rebuild `game/tallow-reach.html`; `npm test`.

## 2026-11-21: Yaw is the slow axis, roll the fast one — per-ship axis tuning

At the owner's request, to promote crossing flight paths: every ship (player
and NPC, through the shared model) now turns with **yaw at 40%** of its old
rate (`FLIGHT.yawFactor` 1.6 → 0.64; mouse side-to-side is the slowest axis),
**pitch unchanged** (1.2), and **roll at 250%** (`FLIGHT.rollFactor` 1.5 →
3.75, Q/E). Thrust, strafe, lift and reverse untouched. NPCs command yaw and
pitch through `npc-pilot.js`, so their steering obeys the same rates; their
pilot still commands no roll (banking is a separate later tweak).

The axes are now tweakable per ship: flight stats gain `yaw`, `pitch`, `roll`
(multipliers on one axis each) and `turnAll` (one multiplier on all three —
`turnAll: 2` turns twice as fast on every axis), defaulting to 1 in
`FLIGHT.defaultStats`. An NPC type sets them in its `flight` block in
`data/enemies.js` (all eight types now spell the fields out at 1); a flyable
hull sets an optional `flight` block in `SHIPS` (`data/ships.js`), which
`player.js` passes to the model and `flightStatsForShip` copies. Test (i) in
`tests/flight-model.test.mjs` pins the ratios and both override levels; the
render-interpolation smoothness floor and the campaign-fixes raider aim
window were retimed for the slower yaw. Both 8b fixtures were re-recorded and
diffed (LESSONS L17): only steering and enemy-flight downstream differ.

Files: `src/sim/flight-model.js`, `src/sim/player.js`, `src/data/ships.js`,
`src/data/enemies.js`, tests, docs. No save change.
Rebuild `game/tallow-reach.html`; `npm test`.

## 2026-11-21: One flight model for every ship, slower turns, First Sortie and navigation polish (save v28)

The batch the owner asked for after playtest round 4 of step 15, in slices.

- **Every ship flies the same flight model.** New `src/sim/flight-model.js` (`stepFlight`) holds the
  player's exact maths — local Y/X/Z quaternion turns with the stick deadzone, `FLIGHT` fractions,
  throttle/brake rates, velocity easing 0.9 (2.4 boosting) and boost adding its own speed again.
  `sim/player.js` keeps power, boost fuel/ignition, warnings and collision around it and is
  byte-identical against a golden copy of the old maths (`tests/flight-model.test.mjs` (a), plus the
  8b fixtures: the player's own pose never moved). New `src/sim/npc-pilot.js` turns the AI's desired
  velocity + aim point into the same stick/throttle/strafe/lift/boost (proportional, clamped), and
  `sim/enemy-flight.js` (fighter, escort, course, observe, prowl, guard) no longer moves `pos`/`quat`/`v`
  or calls `turnEnemy` for movement. The AI decisions are unchanged; `spdFar`/`spdNear`/`spdOrbit` remain
  "how fast it wants to go", capped by its flight stats. NPC drives are unlimited today; `boostAllowed`
  is the one hook a later power system needs.
- **NPC stats are their own numbers.** Every type in `src/data/enemies.js` carries its own copied
  `flight` block at the stock Wasp's values (speed 150, turn 1.2, strafe/lift/reverse 0.6, ease 0.9,
  boostEase 2.4, boostSpeed 150 — from `thruster_basic` + `FLIGHT`), with `FLIGHT.defaultStats` as the
  fallback and `flight.fromShip` as a one-time copy with per-field overrides. Tune ONE type by editing
  only its `flight` block. The old per-type movement numbers they replace: raider turn 1.4 / 125 / 25 / 45,
  captain_korr 1.9 / 210 / 85 / 18, practice_drone 0.9 / 80 / 18 / 25, smuggler 1.5 / 120 / 24 / 44,
  freighter 0.9 / 55 / 16 / 18, hiveguardian 1.9 / 145 / 38 / 58, riftguardian 1.8 / 140 / 34 / 55,
  deepguardian 2 / 155 / 40 / 62 (turn / spdFar / spdNear / spdOrbit). Expect fights to fly differently:
  everything now accelerates, brakes and turns like a Wasp — Dane brakes over seconds (reset-brake test
  widened for exactly that) and boosts past 150 m/s on the fast course legs.
- **All ships turn a third longer:** `FLIGHT.turn` 0.7 → 0.525 (one data number; player and NPC alike).
- **First Sortie:** Flight School is now **Korr Flight Academy** everywhere (ids unchanged, saves safe);
  Dane's "I will keep one busy…" line is gone; the act ends on a new **`dock` objective**
  (`dock-at-academy`) — his report is a radio call in space, the card shows when the pilot docks there.
  Framework first: a generic `dock` step kind (settled only by the `docked` event at its own pocket,
  linter-required `place`, mission-driver support). **Objective glow means "needed now":** briefing
  dialogue no longer lights the wave it spawned, and Dane glows only on the chase step — not during
  control lessons, drills or the ambush.
- **Reset actually resets.** It wiped only the current mode's half; it now wipes both modes
  (`resetAllSave`, staying in the mode pressed from). New LESSONS L32 and `tests/reset-save.test.mjs`.
- **Navigation:** the N panel header is Pocket objects – Filters – Close · N, the Distance sort sits at
  the far right over the distances, and seven **filter preset** boxes live between them (empty = ＋ saves
  the current filters, selecting a preset while editing filters updates it, right-click renames or resets
  it). Presets are saved with the save (**v28**, additive, old saves load empty). The N filters now also
  govern floating HUD labels (an F-lock still draws its label; rocks still never label). Belt label
  grouping is more generous (`BELT_LABEL_GAP_METRES` 1000 → 3000, chaining; no asteroid moved), and
  marker labels split name/distance into spans with a fixed-width tabular distance, so a label no longer
  resizes and shakes as the range ticks over.
- **Outfitting:** dropping a module anywhere in the left Outfitting box fits its left-most bay of the
  right group (a specific bay still wins).
- **Earth-like planet:** new `earth` class (greenish-grey) in `data/planets.js` with its own procedural
  map; it is in the generator pool — existing generated planets may re-roll their class — and the
  main-menu backdrop world is one.
- The two 8b fixture recordings were re-recorded and diffed (LESSONS L17): the combat run's player pose
  is unchanged; only enemy flight and its downstream differ.

Files: `src/sim/{flight-model,npc-pilot,player,enemy-flight,missions}.js`, `src/data/{ships,enemies,
enemy-ai,scenery,planets,missions/index,missions/validate,campaign/m01,campaign/galaxy,factions,places,shops}.js`,
`src/ui/{hud,pocket-list,mission-hud,menu}.js`, `src/render/{planetmaps,menuview}.js`, `src/state/{profile,state}.js`,
`src/{index.html,styles.css}`, tests (new `tests/{flight-model,reset-save,filter-presets}.test.mjs`),
docs. Save **v28** (additive: `profile.pocketFilterPresets`; old saves load with seven empty slots).
Rebuild `game/tallow-reach.html`; `npm test` — see the delivery note for the count.

## 2026-11-20: Playtest round 4: missiles taught, ambush standoff, objective highlights everywhere

The owner's fourth pass over the campaign build, plus universal mission markers.

- **Resuming an act from the title no longer loses the flight HUD.** Leaving an act with Esc → *Exit to main
  menu* left `state.ui.intro` / `state.ui.campaign` set, so `resumeFromSave` fired `launched` at a HUD that
  refused to unhide. `sim/campaign-act.js` `startCampaignAct` and `ui/menu.js` `enterGameMode` now clear both
  flags *before* the save is applied, a mode switch resets places and syncs `state.place`, and the resume emits
  `campaign-act-entered`, which drops the cached weapon-slot markup and re-syncs the reticle. The campaign screen
  only opens the station panel when the pilot really is docked.
- **The starter Wasp leaves the school with Basic Missiles fitted and full.** `state/profile.js`
  `newCampaignProfile()` (used by `newCampaignSave` and `separateCampaignPilot`), and `grantFixedShip(..., {
  campaign: true })` for an act that assigns the hull, fit `missile_basic` in secondary slot 1 and stock
  `MODULES.missile_basic.cap` missiles; `acceptMission` refreshes the live ship's guns and missile stock.
- **The gunnery pass is two waves.** `data/campaign/m01.js`: `spawn-drones` → `drone-brief` → `drone-drill`
  (primary weapons, keys 1–5 + LMB) then `spawn-missile-drones` → `missile-brief` → `missile-drill`
  (secondary weapons, lock tone + right click). `sim/missions.js` `killObjectivesIn` now looks past a
  `dialogue` step to the `kill` step that follows it, so a wave spawned before its briefing is still re-armed
  on reload. `sim/campaign-flight.js` tops the missile rack back up if the pilot empties it with nothing in
  flight during the missile steps.
- **The ambush is a standoff, not a carousel.** `sim/enemy-flight.js` `flyProwl` gives both raiders one shared
  approach corridor (`sim/ai.js` seeds `prowlDir`), brakes them to a halt side-by-side ~150 m from Dane and
  `flyObserve` brakes Dane to a halt facing them, so both sides stare at each other through the dialogue.
- **Universal mission objective markers.** `ui/mission-hud.js` adds `missionTitleColor` (amber for acts and
  story missions, ice for contracts, `titleColor`/`color` override), `activeObjectiveSteps`,
  `objectObjectiveColor(object, kind, ctx)` and `missionWaypoints(ctx)`. `ui/hud.js` glows the matching floating
  marker (`.mk.obj`) for every active objective target — hand-in/offered stations, friendly actors to follow,
  hostile kill/wave-clear targets including wave-clear encounters, crates owed or persistent mission drops,
  asteroid fields and rocks to mine — even beyond the old 900 m crate radius, and draws mission waypoints
  (`.mk.waypoint`) for a destination pocket, an authored `waypoint`/`pos`, a chase course start, or a
  reach/survive/wait signal. `ui/pocket-list.js` `pocketRowsHtml(rows, isSelected, objectiveFor)` marks the same
  rows in the `N` list (`li.objective`, `.pocket-icon.obj`) with the mission's colour. The marker pool rose from
  18 to 28 so waypoints cannot push the ordinary labels out.
- Act 1's dialogue doc and playtest guide record the two-wave pass; the guide's step numbers continue.

Files: `src/{data/campaign/m01.js,sim/{ai,campaign-act,campaign-flight,enemy-flight,missions},state/profile.js,
ui/{hud,menu,mission-hud,pocket-list},styles.css`, tests, docs. No save change (stays **27**). Rebuild
`game/tallow-reach.html`; `npm test` **814 pass / 0 fail**.

## 2026-11-20: Playtest round 3: Dane's guns, the hold bar, the dialogue in one doc

The owner's third pass over the campaign build, plus four follow-up polish items.

- **Dane does not shoot the training drones, and the ambushers warp in to circle first.** `sim/ai.js`
  requires `def.engages === "hostiles"` **and** `e.role === "guard"` before a story ship fires. In First
  Sortie, `spawn-ambush` now runs as `ambush-warning` starts (`warpIn: true, role: "prowl"`): the two
  attackers streak in out of warp and circle around Dane and the pilot (`flyProwl` in `sim/enemy-flight.js`)
  without firing while Dane stays on `observe` and holds his fire. When `ambush-taunt` finishes and
  `defeat-ambush` begins, Dane switches to `guard` and opens fire, and the attackers switch out of `prowl`
  into their aggressive AI (`flyFighter`). Shooting either attacker mid-dialogue (`hitHostile`) breaks the
  parley early and turns the wave aggressive at once.
- **Live distance counter stays after the 500 m bonus is lost, and a failed run slows before returning.**
  `ui/mission-hud.js` `chaseLinesHtml` now keeps `Distance to Dane: now NNN m` under the 1 km rule even after
  the 500 m bonus fails. When the pilot falls more than 1 km behind during the run, Dane no longer whips a
  sudden 180: he brakes to a stop along his heading (`reset-brake` in `sim/enemy-flight.js`), says *"You need
  to keep closer to pass. Let's do it again — follow me back to the start."* (`reset-talk` in
  `sim/campaign-flight.js`, rendered on `#dialogue-panel`), and only turns back to the start once the line finishes.
- **Shorter control prompts.** Each control call in `m01.js` is now one concise line so the pilot spends
  the lesson flying instead of waiting on radio lines; the steering line keeps *"the Wasp is quicker than
  anything you flew at the school."*
- **Weapon slots are keyboard-only (`1`–`5`, `6`–`0`) and top-middle alerts dismiss with R.** Turning down
  with the mouse in flight no longer clicks `#weapon-slots` (`pointer-events: none`, click listener removed
  from `ui/hud.js`), and `#mission-alert` says *Press R to dismiss* and closes on `KeyR`.
- **His rounds were still red for a real reason.** `fire()` → `addEntity` emits `entity-spawned`
  synchronously, and the bullet mesh is built from that record, so assigning `shot.colour` after
  `fire()` returned changed nothing. `sim/combat.js` `fire()` takes a trailing `extra` object and
  assigns it *before* `addEntity`; `sim/ai.js` passes `{ colour: BULLET_COLOURS.cannon }` (orange).
  No new colour abstraction.
- **"The sortie is over" is gone.** `m01.fails.message` is now just "Your Wasp was destroyed."; both
  the MISSION FAILED card and the small alert popup read that one string.
- **The hold bar works again.** The objective's generic sub-line rule (`#tr .hud-mission small`:
  `display: block; white-space: nowrap`) out-rank the old bar's selectors, so the grid never applied
  and the track had no width. The bar's markup moved to a pure, testable `ui/mission-hud.js`
  (`holdBarHtml`, `chaseLinesHtml`, `campaignDetailHtml`) with selectors that win, a grid layout
  (label over track+percent) and an explicit `width: 100%` track. `tests/campaign-fixes.test.mjs`
  now asserts the percentage, the 1 km / 500 m lines and the gathering rule.
- **All First Sortie dialogue in one document:** `docs/FIRST-SORTIE-DIALOGUE.md` — briefing, every
  control call and its objective/hold label, the run's orders and both reset lines, the gunnery pass,
  the ambush, the final report, the failure sentence and the card buttons, with the file to edit for
  each.

Tests 801/801, build 3232 KB. Nothing merged: the owner tests the zip first.

## 2026-11-20: Playtest round 2: objectives back top-right, run form-up, quieter menu

The owner's second pass over the campaign build. Eight corrections.

- **Dane's fire is just cannon fire.** No "ally colour": a round is drawn in the colour of the module that
  fired it. `BULLET_COLOURS.cannon` (`data/weapons.js`, orange) is stamped on his shots in `sim/ai.js`, and the
  renderer colours a bullet by that field (else the pilot's own orange, else hostile red). Damage is still 0.
- **The title is quiet.** The low drone was created at gain 0.08 and nothing lowers it on a screen that never
  runs `updateAudio()`, so it hummed under the campaign menu; it now starts at 0 and only the flight loop raises it.
- **Smaller chapter boxes, redacted future content.** `.campaign-boxes` is a fixed three-column grid (~1/3
  smaller: three chapters fit where two did). Unwritten chapters and acts show no names at all: a blurred
  placeholder reads "Coming soon" with a number, and opening a locked chapter says "This chapter is not
  written yet."
- **Objectives are back in the top right**, in the same block as contracts and story missions; the top-left
  campaign tracker is gone. Under a campaign objective the HUD adds: the control hold bar (percentage) while a
  lesson runs, the run's rule ("Stay within 1 km of Dane for the whole course to pass."), and the still-live
  bonus ("Bonus: within 500 m · now 312 m").
- **Q and E were swapped** in the roll lesson: `MISSION_CONTROLS` read `roll-left` as negative while `KeyQ`
  produces +1, so Q completed E's objective. The signs now match the input record.
- **The run waits for a form-up.** The chase step is `gather: 300`: Dane flies to the fixed start, waits, and
  only starts the ten-kilometre course when the pilot is within 300 m (the course's own gate, now per step).
  His call says "come to my wing — close, within 300 m", the first leg is a slow 95 m/s warm-up, and the
  500 m bonus is not judged while he is waiting (no `mission-near` until the course runs).
- **Clicking Back on the campaign screen no longer blanks the title.** The action had already drawn the title,
  and the panel click handler's tail then hid `#panel` because the pilot was still in space; a title screen now
  keeps the panel regardless of where the pilot is.

Files: `src/data/{weapons,places}.js`, `src/data/campaign/m01.js`, `src/data/flight-courses.js`,
`src/data/missions/rules.js`, `src/sim/{ai,combat,enemy-flight,campaign-flight}.js`, `src/render/views.js`,
`src/core/audio.js`, `src/ui/{campaign,menu,hud}.js`, `src/state/state.js`, `src/index.html`, `src/styles.css`,
tests, docs. No save change (stays **27**). Rebuild `game/tallow-reach.html`; `npm test` **800 pass / 0 fail**.

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

- 2026-11-20: Playtest fixes: friendly fire, one-second lessons, chapter boxes, ambush reveal
- 2026-11-20: Campaign slices: acts, boundaries, dialogue pacing, failure/bonus framework, Dane, First Sortie
- 2026-11-19: Step 15 — campaign scaffolding, dual-mode saves and the Dane Korr tutorial
- 2026-11-19: One HUD label per nearby belt group
- 2026-11-19: Shared natural wormhole environments
- 2026-11-19: Larger, more common black holes in wormhole systems
- 2026-11-19: Multiple wormhole routes and grey system skies
- 2026-11-19: Start with 30 wormhole systems
- 2026-11-19: Step 14d — persistent wormhole systems
- 2026-11-19: Uncharted Space HUD label and 14d exit decision
- 2026-11-18: Station UI rework, reusable left window, Inventory ship list and My Assets destination
- 2026-11-18: Roadmap slice 3 — My Assets, Minecraft-style inventory slots, Mining beams subgroup and 0 MJ power fix
- 2026-11-18: Roadmap slice 2 — compact Shop, Hangar stored-ship list & context menu, Ship details/bonuses and unblurred cargo overlays
- 2026-11-18: Roadmap slice 1 — true moving-collider speed, live Mission log item counts and 10-minute per-station contract timers
- 2026-11-18: Nebula fill 0.175, unified label/lock colours and N-tab lock-square icons
- 2026-11-18: Ore asteroids use natural shaded surface colours with no self-glow
- 2026-11-18: Fix N panel closing, selected-row outline, row separators and HUD transparency
- 2026-11-16: Compact selectable pocket list and aligned lower HUD
- 2026-11-16: Repair N action, stabilise lead and align status bottoms
- 2026-11-16: Batch slice 2 — navigation, lead and actual speed
- 2026-11-16: Missile icon and lower interaction prompts
- 2026-11-16: Remove duplicate weapon-selection messages
- 2026-11-16: Signed throttle and final HUD alignment tweaks
- 2026-11-16: Framed status columns and integrated throttle/speed
- 2026-11-16: Square weapon boxes and slot-height divider
- 2026-11-16: Monochrome weapon strip and top-left location
- 2026-11-16: Compact weapon strip between the HUD columns
- 2026-11-16: Paid boost ignition and ten-slot weapon hotbar
- 2026-11-16: HUD pool units
- 2026-11-16: Tight HUD readings, pool percentages and throttle fill
- 2026-11-16: Mirrored vertical HUD pairs
- 2026-11-16: Feature batch 2 slice 1 — compact flight meters and toggle camera
- 2026-11-16: Nebula fill intensity increased 25%
- 2026-11-16: Subtle sky-tinted ambient fill trial
- 2026-11-16: Exact F picking for all objects; stationary outfitting preview
- 2026-11-16: Part 2 restored, precise asteroid selection and recovery/UI follow-ups
- 2026-11-16: Feature batch Part 1 — targeting and missile UI (items 4–7)
- 2026-11-16: Individual fighter pilots and per-enemy AI personalities
- 2026-11-16: Wider 4 km belts, restored Meridian, quieter planets and circular sky markers
- 2026-11-16: Flatter, lighter belts with naturally thinning edges
- 2026-11-16: C-shaped belts, central arrivals and non-intersecting asteroids
- 2026-11-16: Denser pockets, close warp-ins and massive asteroids
- 2026-11-16: The generated universe rework — vast EVE-like pockets, seeded planets, dedicated belts, four station classes
- 2026-11-16: The edge-compression lens is removed
- 2026-11-16: The frame edges are gently stretched — the edge-compression lens (owner's panel 2)
- 2026-11-16: The system sky passed its playtest
- 2026-11-16: System space — AUs, a true 3D position for every pocket, and a sky that shows the system you're in

- 2026-11-15: Hitting the station hurts again — solid means collision damage, by default

- 2026-11-15: Big moving parts are solid, and a wormhole pocket is really there after a reload

- 2026-11-15: Every weapon stops on a collider — shots no longer pass through the station

- 2026-11-15: The skies are cube maps — six 2048 faces each, no distortion and no seams

- 2026-11-15: Every sky is a generated skybox now — normal space, rifts and wormholes, and the starfield is gone
- 2026-11-15: Kept for later — a black-and-teal sky, installed but worn by no place yet
- 2026-11-15: A skybox generator, so every new instance can have a dark, realistic 4K sky
- 2026-11-15: The Test Ship — a 1-credit hull with 100× Hull HP and 10× damage, flown with the owner's GLB
- 2026-11-14: Models and collision are real models now — drop-in `.glb` files, hulls flush with the drawing
- 2026-11-14: Two owner bugs, part two — the Sell/Discard confirm sits with the cursor, and hunt contracts clear the area they were taken in
- 2026-11-14: Three owner-reported bugs — the Alt camera locks to the hull, one primary fires at a time, no tags over the menu
- 2026-11-14: The rift wears real space too — the deep rift its own sky
- 2026-11-14: Real space inside a simple wormhole — the pocket wears the system's sky
- 2026-11-14: Slice 14c built — simple wormholes spawn themselves, and save v21
- 2026-11-14: The sky loses its lines, and opening a loot card leaves the ship still
- 2026-11-14: Rift revisions after the playtest — the cache is a trade, every run is 20 minutes, and the sky has no stars
- 2026-11-14: Step 14 owner playtest — four bugs, four fixes (the run you quit is the run you come back to)
- 2026-11-14: Enemies are solid — rams damage both ships, rocks kill hostiles, and one falsy detour is fixed
- 2026-11-14: Step 14a feedback built — a rift you can see, lock and open — and slice 14b, a run that survives a quit
- 2026-11-14: Step 14a built — a rift you carry, an instance you fly into, and a cache that stays locked
- 2026-11-14: Step 14 groundwork — instance templates as data, and the owner's wormhole model recorded
- 2026-11-14: VISION records the owner's step 14 rift decisions; open question 5 is closed
- 2026-11-14: The owner confirmed the pending mission playtests; nothing is waiting now
- 2026-11-13: A recovery contract recovers its own crates, and the space is left clean

- 2026-11-13: Contract guidance says where the cargo goes, not how much is aboard
- 2026-11-13: Notices hang just below the flight message line
- 2026-11-13: Right-click Discard everywhere — how many, then "are you sure?"
- 2026-11-13: Press I in space to read the ship's inventory, and the chart no longer stops the clock
- 2026-11-13: Your missions follow you; only the offers and the hand-in stay at a station
- 2026-11-13: No message line that moves the menu, and no "filed at another station" note
- 2026-11-13: A story mission is offered at one station, and only there
- 2026-11-13: Missions belong to the station that filed them, and the docked panel redraws itself
- 2026-11-13: Overlays everywhere in the open world, a quiet exit to the menu, and a cinematic title view
- 2026-11-13: Every mission and contract is handed in at one named station
- 2026-11-13: Dying hands you a complete spare Wasp that can be fitted again
- 2026-11-13: A mission is accomplished by its hand-in, not by its last step; contract wording and colours
- 2026-11-13: Dying no longer fails missions by default; "Mission failed" notice in the HUD
- 2026-11-13: Docs consistency pass for multi-AI handoffs, changelog capped at 10 entries
- 2026-11-13: Docs restructure, LESSONS.md, docs check test, duplicate-mission guard
- 2026-11-13: Step 13d: mission rules, linter, templates and invariant tests
- 2026-11-10: Name the Border Signal object and consume story hand-ins
- 2026-11-10: Make Border Signal's beacon a persistent physical drop
- 2026-11-10: Make Border Signal handoffs resource-safe
- 2026-11-10: Clean up abandoned mission content and gate dialogue
- 2026-11-10: Remove unexplained mission progress counters
- 2026-11-10: Keep mission objectives spoiler-safe
- 2026-11-10: Show player-facing mission objectives in the flight HUD
- 2026-11-10: Stabilize story mission completion and scripted hand-offs
- 2026-11-10: Add pause exit and split the main menu actions
- 2026-11-10: Advance Border Signal after its mission wave
- 2026-11-10: Build Step 13c mission screens
- 2026-11-10: Require mining ore hand-in before contract payout
- 2026-11-10: Restore Destroy contract progress readout
- 2026-11-10: Start Step 13b story mission runtime
- 2026-11-10: Simplify exact pocket route titles
- 2026-11-10: Require salvage delivery before paying recover contracts
- 2026-11-10: Show every active mission in the flight HUD
- 2026-11-10: Start Step 13 mission framework with data-driven contracts
- 2026-11-10: Simplify map markers and current-location labels
- 2026-11-10: Refine destination marker rings and icon scale
- 2026-11-10: Mark destination completion and remove HUD route scrolling
- 2026-11-10: Add route markers and instant galaxy selection
- 2026-11-10: Clarify pocket menus, labels and exact route destinations
- 2026-11-10: Make local route lines solid and pocket menus right-click-only
- 2026-11-10: Preserve real double-click navigation on starmap dots
- 2026-11-10: Vary station names and clarify routed gate navigation
- 2026-11-10: Refine system-map exits and separate generated station pockets
- 2026-11-10: Give every dockable station local persistent inventory
- 2026-11-10: Build Step 12 encounter templates and persistent place memory
- 2026-11-08: Wrap destination names and show local route hops
- 2026-11-08: Remember route destinations across relogs
- 2026-11-08: Remove destination diamond
- 2026-11-08: Mark the route destination and simplify the starmap list
- 2026-11-08: Add route arrows to the flight HUD
- 2026-11-08: Simplify the flight route to system names
- 2026-11-08: Set exact pocket destinations
- 2026-11-08: Clearer, sparser starmap and adaptive route list
- 2026-11-08: Straight starmap lines with attached endpoints
- 2026-11-08: Show the active route in flight
- 2026-11-08: Group route pockets by system and mark the current area
- 2026-11-08: Compact flight route with journey progress
- 2026-11-08: Plot system destinations and jump the route with J
- 2026-11-08: Remember starmap view across closing and travel
- 2026-11-08: Align newly fired cannon visuals with the interpolated hull
- 2026-11-08: Tame galaxy chart drag speed
- 2026-11-08: Step 11B starmap refinements — permanent core labels, zoom-scaled pan/cores, clickable gate neighbours (owner playtest pending)
- 2026-11-08: Step 11B system-map follow-up — free local warp and named central bodies (owner playtest pending)
- 2026-11-08: Step 11B starmap UI follow-up — zoomed system maps, right-click warp, compact overview (owner playtest pending)
- 2026-11-08: Step 11B — clickable starmap, direct-hop travel and save v16 (owner playtest pending)
- 2026-11-08: Step 11A owner playtest passed — full project backup
- 2026-11-08: Step 11A owner playtest guide and live browser preview
- 2026-11-08: Step 11A — organic starmap web, one-peer gates and editable travel rules
- 2026-11-08: Autosave every 30 seconds instead of 15
- 2026-11-08: Come back where you logged out — save v15
- 2026-11-08: Step 10 complete and ticked — owner playtest passed
- 2026-11-08: Step 10 playtest fixes — sound, start screen and loading a save
- 2026-11-08: Step 10 built — place definitions (systems and pockets), save v14
- 2026-11-08: Fix high-refresh (240 Hz) ship blur via between-tick render interpolation
- 2026-11-08: Step 9 complete and ticked — Milestone B reached
- 2026-11-08: Step 8a ticked; step 8b player records and controls
- 2026-11-08: Step 8 slices documented
- 2026-11-08: Step 8a — fixed simulation tick (playtest pending)
- 2026-11-08: Step 7d complete and ticked
- 2026-11-08: Step 7d — entity view registry cleanup
- 2026-11-08: Step 7c and step 7 complete and ticked
- 2026-11-08: Refactor step 7c — hull view and render-free simulation
- 2026-11-08: Step 7b complete and closed (docs only, no code change)
- 2026-11-08: Refactor step 7b — bullets, missiles, crates and particles become data
- 2026-11-08: Step 7a ticked (docs only, no code change)
- 2026-11-08: Refactor step 7a — a hostile becomes data; the mesh becomes a view
- 2026-11-08: Step 6 ticked in full (docs only, no code change)
- 2026-11-08: Refactor step 6b — the sim stops reading the keyboard (step 6 done)
- 2026-11-08: Refactor step 6a — the sim stops playing sounds itself
- 2026-11-07: Recorded what is and is not per-shop about shops (docs only)
- 2026-11-07: Spare modules can be sold (60% of the shop price)
- 2026-11-07: Shop fix — the cannons are listed once, as "Basic cannons"
- 2026-11-07: Refactor step 5 — shops and prices from data (plus a visible Shop change)
- 2026-11-07: Refactor step 4 — the item catalogue and one inventory per place (save v12)
- 2026-11-07: Refactor step 3 — loot tables (drops and ore mix are data)
- 2026-11-07: Refactor step 2 — seeded randomness everywhere
- 2026-11-07: Refactor step 1 — enemies are data (enemy registry, `enemy-killed` event)
- 2026-11-07: Vision, target architecture, roadmap and refactor plan (docs only, no code change)
- 2026-11-07: Inventory Sell quantity uses a game-styled popover
- 2026-11-07: Inventory Sell asks how many units to sell
- 2026-11-07: Inventory grids use five narrower, shorter slots per row
- 2026-11-07: Inventory grids keep their size when empty, and moves no longer show status text
- 2026-11-07: Station and ship item grids scroll independently after three rows
- 2026-11-07: Right-click inventory menu can sell a cargo stack
- 2026-11-07: Inventory tile text restored to the more readable size
- 2026-11-07: Inventory item tiles tightened to reduce empty space
- 2026-11-07: Inventory tiles move one item on click and a stack on Shift-click
- 2026-11-07: Inventory contents displayed as a compact grid
- 2026-11-07: Lateral, vertical and reverse thrust increased to 60%
- 2026-11-07: Boost works from any throttle and press snaps throttle to full forward
- 2026-11-06: HANDOFF.md rewritten to match the project as it is now (docs only)
- 2026-11-06: Docs scale: old changelog entries move to an archive (docs only)
- 2026-11-06: Inventory — the station and every ship have room in m³, and you can buy more than one module
- 2026-11-06: Handoff note brought up to date (docs only)
- 2026-11-06: Repairs and missile restock moved into Outfitting
- 2026-11-06: Ship switcher above the 3D viewer; the berth count is gone
- 2026-11-06: Whole numbers in the top-left readouts; labels recoloured to match their bars
- 2026-11-06: Numbers on the shield and hull bars — and the units are "Shield HP" / "Hull HP" everywhere
- 2026-11-06: Asteroid collision damage scaled to the 10-point hull
- 2026-11-06: The hull is a module — "Basic hull", 10 hit points, no module fitted means none
- 2026-11-06: The missile launcher is a module — "Basic missiles", 8 damage, 12 cap, 4 s reload — and the beam shows its rate
- 2026-11-06: All hulls are the same ship apart from the hold — and the hold is measured in m³
- 2026-11-06: The beam bar moves under the mining hint, only while cutting — and an ore-secured chime
- 2026-11-06: Beam progress resets the moment contact is lost; beam bar in the HUD; module names in the UI
- 2026-11-06: The mining beam is a module — "Basic mining beam", one ore per 4 s of contact
- 2026-11-06: "Empty weapon slot" now covers an empty cannon slot too
- 2026-11-06: Keys 1 and 2 now cycle the primary slots; key 2 with no beam is the "Empty weapon slot"
- 2026-11-06: Pressing 2 with no mining beam fitted no longer shows a message
- 2026-11-06: Twin-linked bolts fire from the fixed nose hardpoints (one per side)
- 2026-11-06: Basic cannons fire two bolts per shot again (twin-linked barrels)
- 2026-11-06: Basic cannons are a module you can fit in either primary bay; raiders are Newbie Raiders with 10 hull
- 2026-11-06: The boost tank has numbers: 10 units, 2 a second out, 1 a second back
- 2026-11-08: Step 8 ticked; step 9 split saves (v13) and per-pilot rules — playtest pending
- 2026-11-08: Step 8c owner playtest passed
- 2026-11-08: Step 8c scoped implementation complete — playtest pending
- 2026-11-08: Step 8c in progress — explicit flight, shields and damage
- 2026-11-08: Step 8c started — player-specific transforms and launches
- 2026-11-08: Step 8b complete and ticked
- 2026-11-06: Shield power made simple: a flat 2 MJ/s, and shields bleed when it is not there
- 2026-11-06: Shields cost power: 1 MJ/s up, 2 MJ/s while recharging
- 2026-11-06: Smaller shield numbers: 10 points, 1 a second, 1 damage a shot
- 2026-11-06: Shields are a module now; pirate cannons do 10 a shot
- 2026-11-06: Lighting the boost costs a flat 20 MJ; refilling the meter is free
- 2026-11-06: Thrusters use power, and a dry cell winds the speed down
- 2026-11-06: "Equip thrusters to move" warns you when a dead ship ignores the controls
- 2026-11-06: No thrusters means no movement, no turning and no boost
- 2026-11-06: Paint bays are clickable, and show an empty colour store
- 2026-11-06: Fix: the Appearance bays lost their boxes
- 2026-11-06: Basic thrusters, and every hull flies like the Wasp
- 2026-11-06: Click a bay to fit a module, or unequip one into storage
- 2026-11-06: Basic powerplant and power cell, with a power bar in flight
- 2026-11-06: Powerplant talks in MJ/s, not MW
- 2026-11-06: Appearance card under the Hull bay
- 2026-11-06: Outfitting screen with a 3D ship viewer
- 2026-11-05: The chase camera stops running away at speed
- 2026-11-05: Flight feels heavier: slower turn, weak side/reverse thrusters
- 2026-11-05: Warp lets the ship coast and unwind, instead of freezing it
- 2026-11-05: Fix: no rotation when warping
- 2026-11-05: Warp animation, warp sound, and a two-second warp
- 2026-11-05: Second sector, warp on M
- 2026-11-05: Project tidy for growth (no gameplay change)
- 2026-11-05: Pause menu and mute
- 0.2.0: Baseline
