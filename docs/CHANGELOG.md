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

## 2026-11-13: Dying no longer fails missions by default; "Mission failed" notice in the HUD

Small gameplay change. **Save version unchanged (v19)**; rebuild needed (`npm run build`, then `npm test`).

- **Why:** death already costs the ship and its hold, so it should not also fail a mission unless the mission wants that.
- **`sim/missions.js`:** a mission now fails on death only if its data declares `fails.on: ["player-dead"]`, or the ship was carrying a
  mission-only item (category `mission`) the mission needs (new `missionOnlyItems(mission)`). The second case needs no declaration and
  says "Your ship was destroyed and the X it carried was lost." Every failure now carries a message (a default per reason when
  the rule has none) and the `mission-failed` event carries `title`.
- **`sim/player.js`:** `player-dead` now carries `lost`, the hold at the moment of death, so the result never depends on listener order.
- **Data:** The Border Signal no longer declares a death failure (it still fails if you die carrying the beacon); the Parcel run test
  mission lost its explicit rule (same behaviour, now derived); the Ambush run keeps its explicit one on purpose. Saved Border Signal
  missions pick up the new rule on load (their `fails` is re-read from the data).
- **`ui/missionlog.js`, `styles.css`:** a red "Mission failed: <mission>" notice with the reason sits over the flight HUD and the docked
  screen for 15 s or until clicked. Abandoning shows none.
- **Linter:** no longer requires a death rule for missions that use mission items (the framework handles it).
- **Tests:** new `tests/mission-death.test.mjs`; the die-at-every-step invariant, the lint, 13b and 13c tests updated. Docs:
  `MISSION_RULES.md`, `LESSONS.md` (L10), new guide `testing/TESTING-DEATH-AND-MISSIONS.md`.

---

## 2026-11-13: Docs consistency pass for multi-AI handoffs, changelog capped at 10 entries

Docs and one docs test only; **no game code changed, save version unchanged (v19)**, no rebuild needed.

- **Changelog rule simplified and enforced:** `CHANGELOG.md` holds **at most 10 full entries**; adding one that makes 11 moves the
  oldest to the archive (verbatim) with an index line. The old "more than 15, then trim to 10" wording is gone from `CHANGELOG.md`,
  `ARCHITECTURE.md`, `HOW_TO_ADD.md`, `AI_PROMPTS.md`, `AGENTS.md` and `HANDOFF.md`. This change moved the oldest entry
  ("Stabilize story mission completion and scripted hand-offs") to the archive.
- **`tests/docs.test.mjs`:** new checks that the changelog has at most 10 full entries, and that its "Older entries" index matches the
  archive's headings exactly (same titles, no duplicates).
- **Step status has one home (`ROADMAP.md`):** the duplicate status lines in `REFACTOR_PLAN.md` steps 12 and 13 and the step list in
  `HANDOFF.md` now point to the ROADMAP table; the ROADMAP "current position" paragraph no longer restates the table.
- **`HANDOFF.md`:** new "Before you end a chat" checklist (changelog, roadmap, handoff, Last checked, folder READMEs, build/test, zip).
- **Stale references removed:** `AI_PROMPTS.md` no longer says a root `CLAUDE.md` exists (only `AGENTS.md` does; the starter prompt
  covers tools that do not read it); a ROADMAP parking-lot line pointing at text that no longer exists in HANDOFF was removed.
- **Step 13 ticked in `ROADMAP.md`** (owner playtested the mission framework, 2026-11-13). Its four playtest guides moved to
  `testing/passed/` and `testing/README.md` was updated. Step 12 stays unticked: its playtest is not recorded.
- **REFACTOR_PLAN slimmed:** the long "Mission-safety enforcement plan" (the eight principles applied to missions) moved word for word to
  `docs/architecture/mission-principles.md`, listed in `ARCHITECTURE.md`; the plan keeps a link.
- **Stale facts removed from `docs/architecture/feature-notes.md`:** a "381/381 tests, 746 KB bundle" results note, a "Current package:
  tallow-reach-latest-build.zip" bullet (no such file is in the project) and playtest-pending sentences that duplicated ROADMAP. The
  original wording is kept in `docs/archive/HANDOFF_2026-11-10.md`. Do not put test counts or bundle sizes in the docs: they go stale.
- **File lists completed:** `src/data/README.md` (`camera.js` and every file in `missions/`), `src/state/README.md` (`controls.js`),
  `src/util/README.md` (`ids.js`), and the `ARCHITECTURE.md` file map (all current `sim/`, `ui/`, `data/` and `state/` files; it now
  says the folder READMEs are the authoritative list).

---

## 2026-11-13: Docs restructure, LESSONS.md, docs check test, duplicate-mission guard

Docs-only restructure so new AI chats read less and the project stays scalable, plus one small guard. **Save version
unchanged (v19)**; rebuild needed (one source change).

- **`docs/HANDOFF.md` rewritten short** (about 130 lines): start-here steps, a "read these docs for this task" table, current
  state, the owner's ground rules (all kept), a "keeping the game scalable" section, the bug-report procedure and the doc map.
  The old file is kept word for word in `docs/archive/HANDOFF_2026-11-10.md`; its long "Where things stand" section is now
  `docs/architecture/feature-notes.md`.
- **`docs/LESSONS.md` (new):** classes of bug earlier chats hit (repeated accept/abandon multiplying ships, full hold abandoning
  a mission, warp mid-dialogue failing it, items appearing in the hold, and more), each with cause, rule and the test that
  enforces it. Rule for every chat: when the owner reports a bug, add a failing test, fix the class, update LESSONS.
- **`docs/HOW_TO_ADD.md` split:** the 21 recipes are now one file each in `docs/recipes/` (numbers unchanged), with an index.
- **`docs/ARCHITECTURE.md` split:** conventions and known gaps moved word for word into `docs/architecture/` (content-data,
  ship-systems, simulation-and-rendering, ui-and-screens, world-and-map); the main file keeps the layers, universal conventions,
  events, state and saves. "Keeping the docs scalable" rewritten with the new rules (one home per fact, archive never delete).
- **Status in one place:** step status lives only in `docs/ROADMAP.md` (current-position prose rewritten; the old text is in
  `docs/archive/ROADMAP_STATUS_2026-11-10.md`). `docs/REFACTOR_PLAN.md` steps 1 to 11 moved to
  `docs/archive/REFACTOR_PLAN_STEPS_1-11.md`.
- **Playtest guides** moved from the project root to `testing/` (current ones on top, finished steps in `testing/passed/`,
  `TEST-OLD-CODES.txt` beside them) with `testing/README.md`. Older changelog entries name the guides without a folder.
- `README.md`, `AGENTS.md` and `docs/AI_PROMPTS.md` updated: read HANDOFF first and only the docs the task needs; the starter
  prompt, the bug-report wording and the "content is data" rule.
- **`tests/docs.test.mjs` (new):** fails if a doc grows past its size limit, a relative link breaks, an index misses a file,
  HANDOFF's save version differs from `SAVE_VERSION`, a "Last checked" line is missing, or a lesson lacks a rule or enforcement.
- **Source change: `acceptMission` (`sim/missions.js`) refuses to start a story mission that is already active.** Before, only
  the Mission log hid an active offer, so a second start would run the script twice and double every spawn. New tests in
  `tests/mission-invariants.test.mjs`: a story mission cannot be active twice; accepting and abandoning a mission over and over
  never multiplies its ships or crates.
- Changelog rotated per its own rule (more than 15 full entries): the oldest moved word for word to the archive with index lines.

---

## 2026-11-13: Step 13d: mission rules, linter, templates and invariant tests

Hardens the mission framework so illogical missions are caught when written, not found in play.
No gameplay behaviour changes for Border Signal; **save version unchanged (v19)**; rebuild needed.

- `docs/MISSION_RULES.md` (new): the realism rule, the eight rules and what enforces each, a checklist.
  Linked from `AGENTS.md`, `HANDOFF.md`, `HOW_TO_ADD.md` section 11 and `REFACTOR_PLAN.md` step 13.
- `src/data/missions/validate.js` (new) and `rules.js` (new, `minSpawnDistance` 600): a mission linter run
  over every authored mission by `tests/mission-lint.test.mjs`. Errors on: missing `next`, objective or
  situation; numeric step targets; unreachable steps, dead ends and loops; spawns too close or while
  docked; a collected mission item nothing drops; `take-item` with no source; a wave wait with no wave;
  the `deliver` step (nothing emits "delivered"); failure with no message; a mission-only item with no
  `player-dead` failure rule.
- Step targets now accept `"end"` (`sim/missions.js` `stepIndex`). Border Signal uses it instead of the
  bare `next: 11`, and its last step names `next: "end"`. Numeric targets still work for old saves.
- `src/data/missions/templates.js` (new): `briefing`, `radio`, `travelTo`, `loadCargo`, `handOver`,
  `ambush`, `mineOre`, `sequence`, `mission`. They fill in the situation rules and every `next`.
- `src/data/missions/test-missions.js` (new): Parcel run (cargo), Radio relay (radio only, a choice),
  Ore run (mine N), Ambush run (fail and replay). New item `parcel` in `data/items.js`. They are not
  offered to normal players; open the game with `?testmissions` and they appear under "Test missions" in
  the Mission log (`ui/missionlog.js`). `storyMission(id)` also finds them.
- `sim/missions.js`: a dock-side step that is blocked by a full hold now says "Dock at a station and make
  room in your hold" when the pilot is flying, instead of only "make room".
- `tests/mission-invariants.test.mjs` and `tests/mission-driver.mjs` (new): a scripted pilot plays every
  mission, normally, wandering, reloading at every step, with a full hold, destroyed at every step (then
  replaying), and two missions at once. Checks: never stuck; nothing silently failed or abandoned; items
  move only by real pickup, hand-over or hand-in; dialogue buttons never change the world; spawns are
  at a safe distance; a save and load keeps every authored field; replays start clean.
- `tests/step13b-missions.test.mjs`: the reachability test accepts the `"end"` target.
- `TESTING-13D-MISSION-RULES.md` (new): the owner playtest.
- Known gaps recorded in MISSION_RULES.md: `deliver` is unimplemented, feature-anchored spawns, silent
  timeouts, no escort objective.
- Tests: 437 pass. Needs the owner playtest before step 14.

---

## 2026-11-10: Name the Border Signal object and consume story hand-ins

- Added a dedicated `beacon` catalogue item named **Beacon**. Border Signal's authored defeat drop, collect objective, dialogue wording and objective now refer to that id; ordinary hostile `salv` loot remains unchanged.
- Mission reward hand-in detection now covers item-bearing `collect`, `deliver` and `mine` objectives, including story missions and nested parallel objectives. The exact required quantity is taken from the current station first and then the active ship hold before payout; missing stock leaves the completed mission active and unpaid.
- Existing Border Signal mission records that used `salv` are migrated to `beacon` where they describe the authored persistent drop. Save version remains **19**.
- Verification: `npm test` passes **381/381**, `npm run build` produces a **746 KB** bundle, the ZIP passes `unzip -t`, and the preview serves HTTP 200.

---

## 2026-11-10: Make Border Signal's beacon a persistent physical drop

- The Border Signal's authored Beacon now drops from the first patrol ship at that ship's defeat position instead of being silently granted by a mission script. Ordinary raider salvage loot remains additive, while the authored crate is mission-tagged and visually/physically collectible.
- The mission crate survives leaving Hollow, world clearing and v19 save/load, restores once at its saved position, remains present when the hold is full, and marks itself collected only after a successful non-docked pickup. Abandoning or rewarding the mission removes its saved marker and runtime content.
- Added headless coverage for physical pickup gating, defeat-position placement, full-hold retry, duplicate-free save/load restoration, collected-drop suppression, old-save fallback and cleanup. Save version remains **19**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Make Border Signal handoffs resource-safe

- A full cargo hold now pauses the beacon handoff with an actionable **Make room in your hold to continue.** instruction. Inventory changes and docking retry pending item scripts, but the beacon remains a Hollow retrieval: unloading at the station cannot complete a remote handoff; return and finish the arrival warp to collect it.
- Multi-action item scripts preflight their combined capacity and resources, so a blocked batch cannot partially transfer an earlier item and duplicate it on retry. Station-gated dialogue also refuses stale calls without a current docked pilot.
- Border Signal no longer auto-fails for leaving Kestrel Hollow or for an undisplayed timeout. Its only automatic failure is the clear, reported cause of ship destruction; explicit player abandonment remains the destructive choice.
- The station briefing now uses spoiler-safe investigation wording and leads to a travel objective. The mission activates its sector and spawns the distant, mission-tagged patrol only after the pilot enters Kestrel Hollow, never because a dialogue button was clicked.
- v19 save sanitization now restores new situation requirements, preserves nested parallel counters, and migrates older Border Signal saves by stable step id without reviving timeout/leave failure. Documented the enforcement plan and known limits for all eight architecture principles in `docs/REFACTOR_PLAN.md`. Save version remains **19**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Clean up abandoned mission content and gate dialogue

- Mission-spawned hostiles, their hostile shots and their loot now carry the mission identity. Abandoning a mission removes those records and their views without clearing ordinary patrols, derelicts or other place content.
- Authored station-contact dialogue becomes **Redock to continue talking.** when the pilot undocks, with Continue and choice controls blocked until docking again. In-field dialogue remains actionable during flight, including the Border Signal beacon handoff.
- Leaving a mission sector while a dialogue line is open no longer interprets the open panel as mission abandonment. This keeps a pending station conversation resumable after redocking and lets the beacon line survive a return warp before Close is clicked.
- Added regressions for scripted-wave cleanup, dialogue scope, save metadata and the warp-before-Close case. Save version remains **19**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Remove unexplained mission progress counters

- Removed the ambiguous `Progress 0/2` display from story missions. It was counting the two lines in the current dialogue, not overall mission completion, so dialogue-line counts and non-quantitative story-step bars are no longer shown in the Mission log.
- Quantitative contract missions retain a clearly labelled `Objective progress: 0 of N` count, and hunt progress in the flight HUD now says `0 of N defeated` instead of an unexplained fraction.
- Added UI regression coverage and updated the browser checklist. Save version remains **19**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Keep mission objectives spoiler-safe

- Separated player-facing `objective` text from compatibility/internal `log` text. The HUD and Mission log now use only the data-defined objective, so a procedural trigger such as `wave-clear` cannot reveal a future encounter.
- The Border Signal now tells the player to **Investigate the signal in Kestrel Hollow** and later **Stay with the signal in Kestrel Hollow**, then uses discovery-oriented wording before the return home. Contract templates use data-defined objective placeholders without changing their known requirements.
- Objective text survives the existing v19 save sanitization, and fallback wording for missions without an authored objective no longer exposes internal triggers or step counts. Focused mission/UI tests pass **21/21**; rebuild the generated HTML and complete-project ZIP after this change.

---

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
