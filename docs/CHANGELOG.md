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

## 2026-11-13: Your missions follow you; only the offers and the hand-in stay at a station

Owner correction to the station-scoping round: "Active story missions are not visible if you dock into another station...
accepting border signal doesnt show anything in progress when im docked at galereach." Right: progress is the pilot's,
not the counter's. **Save version unchanged (v19)**; rebuild needed (`npm run build`, then `npm test`).

- **Every active mission is listed at every station.** `ui/missionlog.js` and the Contracts tab
  (`ui/screens.js`) no longer filter the active list by station: a job taken at Meridian shows at Galereach with its
  status, objective, progress bar and dialogue preview, and can be abandoned from anywhere. The `missionFiledAt` helper
  is gone — it existed only for that filter.
- **Only the hand-in is station-bound.** Elsewhere the card reads "Deliver to Meridian Station" and shows a disabled
  **Hand in at Meridian Station** button; at the mission's own station the same button is **Hand in cargo**. Public
  options are unchanged: the chest `completeMission` refusal, the cargo never leaving the hold, and the reward only at
  the station that takes it.
- **Station conversations stay at their station.** Now that a mission is listed everywhere, its counter dialogue must
  not be playable from the wrong counter. A `requiresDock` dialogue is live only while docked at the station that gives
  the mission out (`missionAtItsStation`): elsewhere the card is read-only and says "Return to Meridian Station to
  continue talking.", and `advanceDialogue` refuses the same click. In-field dialogue (the beacon hand-off) is unchanged.
- **Offers are still station-specific.** The story offer list (`missionOfferStation`) and per-station contract boards
  (`boardAt`) are untouched: Galereach still offers nothing to accept, and an accepted Border Signal is not offered a
  second time.
- **Tests:** `tests/mission-station-scoping.test.mjs` now pins the corrected rule — both jobs visible at both stations,
  hand-in live only at the right one, Abandon present everywhere, the real-seed check extended (accept the Border Signal
  at Meridian, dock at Galereach, and the log shows the mission there with no story offer), and a new test that the
  Meridian briefing cannot be played from another station.
  `tests/mission-handin-station.test.mjs` expects the mission listed at the wrong station with a disabled, station-named
  hand-in. 487 tests pass.

Files: `src/ui/missionlog.js`, `src/ui/screens.js`, `src/sim/missions.js`, `src/sim/contracts.js`,
`src/ui/README.md`, `testing/TESTING-BASELINE.md`,
`tests/mission-station-scoping.test.mjs`, `tests/mission-handin-station.test.mjs`, `docs/MISSION_RULES.md`,
`docs/architecture/ui-and-screens.md`, `src/ui/README.md`, `testing/TESTING-BASELINE.md`.

---

## 2026-11-13: No message line that moves the menu, and no "filed at another station" note

Owner feedback on the docked screens: "if you are in another station it says 1 mission is filed at another station. fly
there to read it. You dont need to mention that just say 'No active missions here'", and "remove these types of UI
notifications... I dont like it when notifications cause the entire UI to shift". **Save version unchanged (v19)**;
rebuild needed (`npm run build`, then `npm test`).

- **The Mission log and Contracts tab no longer explain where the other work is.** A station with no missions simply
  reads "No active missions here."; the `N missions are filed at another station` line is gone from both screens
  (`ui/missionlog.js`, `ui/screens.js`). Filtering is unchanged — another station's missions still do not appear.
- **The panel never prints a message.** `outpostHtml` used to start with `<div class="ok">…</div>`, so every action that
  returned a string pushed the whole menu down: "Contract accepted. Launch when ready.", "Sold 12 items for 340 cr.",
  "Basic Power Plant moved to storage.". That element and `state.ui.toast` are gone.
- **Routine confirmations are silent; refusals and warnings are a fixed overlay.** New `ui/notice.js` owns the rule:
  `isRoutineReply()` lists the replies that only restate the redrawn panel (accepted, paid, sold, moved, fitted,
  restocked, repaired, bought-into-storage, saved/loaded/deleted slot, reset, imported), and `notify()` shows anything
  else — a refusal, a save/import failure, a galaxy-recovery warning — in a `#panel-notice` element fixed to the
  viewport (`role="status"`, click to dismiss, 7 s). An unrecognised message is shown, never swallowed. The "mission
  failed" alert is untouched.
- **No layout can shift:** `#panel-notice` is `position: fixed` outside the panel; the panel's markup has no message
  slot at all. A test asserts both.
- **Tests:** new `tests/ui-notices.test.mjs` (silent replies, visible refusals, the panel renders no message, the CSS is
  fixed). Existing tests that observed `state.ui.toast` now read `shownNotice()` from the same module
  (`tests/step10-fixes.test.mjs`, `tests/step11b-starmap.test.mjs`, `tests/navigation.test.mjs`); the mission-log tests
  assert the elsewhere note is gone. 487 tests pass.

Files: `src/ui/notice.js` (new), `src/ui/menu.js`, `src/ui/screens.js`, `src/ui/missionlog.js`, `src/ui/pause.js`,
`src/state/state.js`, `src/styles.css`, `tests/ui-notices.test.mjs`, `tests/step10-fixes.test.mjs`,
`tests/step11b-starmap.test.mjs`, `tests/navigation.test.mjs`, `tests/mission-station-scoping.test.mjs`,
`tests/mission-handin-station.test.mjs`.

---

## 2026-11-13: A story mission is offered at one station, and only there

Owner follow-up to the station-scoping round: "missions by default are specific to a station — Border Signal is only
available at Meridian; at Galereach the Mission log should have nothing to accept as a story mission."
**Save version unchanged (v19)**; rebuild needed (`npm run build`, then `npm test`).

- **The default is one station, and there is no "offered everywhere" form.** `missionOfferStation()` resolves the
  offering station as `offeredAt`, else the station the mission is handed in at, else the home station — so an
  authored mission without either field is still Meridian-only, never global. The Mission log lists a story offer
  only where that resolves to the station being read, and `ui/menu.js` refuses a `story` action anywhere else.
- **Fails closed instead of silently moving.** A mission whose `offeredAt` names an unknown id, or a pocket with no
  station, is offered **nowhere** (the linter already reports it as an error) rather than falling back to the home
  station. `sim/missions.js` gains `stationPocket(id)`, which requires a real station pocket, because `stationAt`
  alone accepts any unknown id — the place catalog falls back to Meridian for ids it does not know. `missionHandInStation`
  and the hand-in stamping use it too, so a corrupt `handIn.station` in an old save resolves from `origin` instead of
  filing the mission at a station that does not exist.
- **Verified at the real Galereach:** new regression in `tests/mission-station-scoping.test.mjs` builds the seed's
  galaxy (122 station pockets), docks at the station named Galereach, and asserts the Mission log has no Border Signal
  and no `data-a="story"` button there, while Meridian in the same galaxy still shows both. A second test pins the
  fail-closed rule. 484 tests pass.

Files: `src/sim/missions.js`, `tests/mission-station-scoping.test.mjs`, `docs/MISSION_RULES.md`,
`docs/architecture/ui-and-screens.md`, `src/data/README.md`.

---

## 2026-11-13: Missions belong to the station that filed them, and the docked panel redraws itself

Two owner-reported fixes. **Save version unchanged (v19)** — `world.boards` is an additive field with a
default; rebuild needed (`npm run build`, then `npm test`).

- **Station-specific missions and contracts:** a station's contract board used to be the world's one board,
  so a job read at Meridian could be accepted at Depot, and the Mission log listed every active mission no
  matter where it was taken. New `sim/contracts.js` `boardAt(placeId, world)` gives every station its own
  offers (`world.board` stays the home station's list so old saves keep theirs in place; other stations get
  `world.boards[placeId]`, generated on first look); `ensureBoard(world, placeId)` and
  `rerollBoard(world, placeId)` work per station, and `acceptContract(index, profile, world, placeId)`
  rerolls only the board it read. `acceptMission`/`instantiateMission` take the giving station explicitly,
  so a contract taken from Depot's board is stamped Depot even when the caller is not standing there.
- **The Mission log and Contracts tab are scoped to the current station:** both filter with
  `missionFiledAt(mission)` (filed where it is handed in), and a line below says how many missions are
  filed elsewhere ("1 mission is filed at another station. Fly there to read it."). Story missions are
  offered only where `missionOfferStation()` points: `data/missions/story.js` now says `offeredAt: "reach"`
  for the Border Signal, the linter rejects an `offeredAt` that is not a station, and `ui/menu.js` refuses a
  `story` action for a mission offered elsewhere.
- **Buttons address missions by id, not by list position:** the panels list a filtered selection, so a
  position would hit the wrong record once another station's missions exist. `data-b` now carries
  `mission.id` in `ui/screens.js` and `ui/missionlog.js`, and `ui/menu.js` passes it through unchanged.
- **The docked panel redraws when a mission changes:** the panel is HTML drawn when it is opened, so closing
  the Border Signal's final dialogue left the card offering **Abandon** while the beacon was already aboard.
  `ui/missionlog.js` now emits `mission-ui-refresh` after every mission event except the ones that already
  redraw the panel (mission-ui-refresh, main-menu, docked, launched); `ui/menu.js` listens and redraws the
  visible panel. Closing the last line now shows **Hand in cargo** straight away.
- **Save:** `newWorld()` gains `boards: {}`; `cleanWorld` keeps only pockets that exist and are not the home
  station, and only boards with at least one valid offer, so a save never grows from stations merely
  visited.
- **Tests:** new `tests/mission-station-scoping.test.mjs` (5 tests: per-station boards and rerolls, filing at
  the giving station, scoped log/tab with the elsewhere count, story offers only at their station, and the
  dialogue-close redraw). `tests/mission-handin-station.test.mjs` now expects the wrong station to hide the
  mission instead of disabling its button; `tests/step9-save.test.mjs` expects `boards`. 482 tests pass.

Files: `src/sim/missions.js`, `src/sim/contracts.js`, `src/sim/session.js`, `src/state/profile.js`,
`src/data/missions/story.js`, `src/data/missions/validate.js`, `src/ui/screens.js`, `src/ui/missionlog.js`,
`src/ui/menu.js`, `tests/mission-station-scoping.test.mjs`, `tests/mission-handin-station.test.mjs`,
`tests/step9-save.test.mjs`.

---

## 2026-11-13: Overlays everywhere in the open world, a quiet exit to the menu, and a cinematic title view

Four owner-reported UI fixes. **Save version unchanged (v19)**; rebuild needed (`npm run build`, then `npm test`).

- **Pause card order:** Resume is now the first control and **Exit to main menu** the last, with the sound
  switch between them. The markup lives in `ui/overlays.js` (`pauseOverlayHtml()`), so the order is one place.
- **Pause and starmap while docked:** both used to be refused unless the pilot was flying. New
  `ui/overlays.js` owns the rule (`canPause`, `canOpenStarmap`) and `main.js` plus `sim`-facing `openStarmap`
  ask it: only the title screen, the pause overlay itself, a dead pilot or a warp refuses. Plotting from the
  chart while docked works; the warp itself still needs a launch, and the chart now says "Docked: launch to
  warp." instead of offering a course that does nothing.
- **Quiet exit to the menu:** the simulation stops behind the title screen, so `updateAudio()` stopped
  driving the loops and the engine droned on. `core/audio.js` gains `fadeToSilence(seconds)` (a 1.8 s ramp on
  every looping voice — engine hiss and growl, roar, beam hum, drone, docked pad and its LFO — not a hard
  cut), called from a `main-menu` listener. Playing again ramps everything back up.
- **Cinematic title screen:** the menu used to show whatever the game camera last rendered (the pocket the
  pilot quit in). New `render/menuview.js` draws its own scene — the home station turning with its planet
  behind it — from `DEFAULT_PLACE` features only, on the path in `data/camera.js` (`MENU_CAMERA`,
  `menu-pose`-style `menuPose`, sway 110 s, distance 520) and independent of the saved world, so the
  background is the same every time. It also nudges the station left of centre on wide screens so the title
  panel does not cover it. `render/scene.js` now exports `stationModel`/`planetModel` so both scenes use one
  copy of the station geometry.
- **Tests:** new `tests/ui-overlays.test.mjs` (pause card order, both overlays allowed at a station and
  refused on the title screen/pause/warp/death, the title camera always framing the station with the planet
  behind it, and the fade being safe with no speakers).
- **Docs:** `docs/architecture/ui-and-screens.md` conventions, `src/ui`, `src/render` and `src/core` README
  rows, and steps 4–6 of `testing/TESTING-BASELINE.md`.

---

## 2026-11-13: Every mission and contract is handed in at one named station

Fixes "the game does not care which location you hand a mission in at." **Save version unchanged (v19)** — the field is
additive and older missions resolve it from `origin`; rebuild needed (`npm run build`, then `npm test`).

- **Why:** `completeMission` asked only that the pilot be docked, so any station paid any mission, and the guidance named
  whichever station the pilot happened to be at instead of the one that takes the hand-in.
- **The rule (data):** a mission is handed in at **one station** — the one that gave it out, unless its data names another
  with `handIn.station: "<pocket id>"` (a job that starts at one station and ends at another). `BORDER_SIGNAL_MISSION` now
  declares `handIn.station: "reach"` and says `"Return to {station} with the beacon."`.
- **The runner (`sim/missions.js`):** `acceptMission` stamps `handIn.station` on the mission when it is taken, so the station
  survives a save and cannot drift as the pilot travels. New `missionHandInStation`, `missionHandInStationName`,
  `atMissionHandInStation` and `canCompleteMissionHere`. `completeMission` refuses any other station ("Hand this in at
  Meridian Station."), takes nothing and pays nothing. Fallbacks so a mission can never become impossible: a mission saved
  before the field existed resolves its `origin`, an offer resolves the station the pilot is docked at, and a station that no
  longer exists falls back to the home station.
- **Guidance:** `{station}` is filled in with the mission's hand-in station, never "a station" or wherever the pilot is;
  a mission with nothing to hand over now says "Contract complete. Return to Meridian Station to collect the reward."
- **Screens (`ui/missionlog.js`, `ui/screens.js`):** away from the station the status reads "Deliver to <station>" and the
  hand-in button is disabled with the station named ("Hand in at Meridian Station"), next to Abandon; at the right station it
  reads "Ready to hand in" and "Hand in cargo" as before. Story offers say where they are handed in.
- **Save (`state/profile.js`):** `cleanMission` keeps `handIn` (objective and station) instead of dropping it, and Border
  Signal's authored station always wins. No `SAVE_VERSION` bump.
- **Linter (`data/missions/validate.js`):** `handIn.station` must be a pocket with a station feature; any other `handIn` key
  is flagged; a hand-in sentence that names neither `{station}` nor the station itself is a warning.
- **Tests:** new `tests/mission-handin-station.test.mjs` (a second station pocket proves the contract taken at Meridian cannot
  be paid at Depot Station and vice versa, a data-chosen station, the save round trip, and the linter). Two existing wording
  assertions updated.
- **Docs:** `MISSION_RULES.md` rule 11 and a "Where the hand-in happens" paragraph, recipes 03 and 11, mission principles,
  `src/sim/README.md`, and the playtest guide.

---

## 2026-11-13: Dying hands you a complete spare Wasp that can be fitted again

Fixes "if you die, you get a free wasp. Cant then equip equipment to the ship." **Save version unchanged (v19)**;
rebuild needed (`npm run build`, then `npm test`).

- **Why:** `die()` deleted the lost hull's fleet records and then added the replacement as a bare hull id. A ship's bays *are*
  `profile.loadout[ship]`, so the free Wasp had no bays at all: Outfitting had nothing to fit into, and drive, Hull HP and guns
  all read as empty. A save/reload rebuilt the fit (`cleanLoadouts`), which is why the bug only showed in a live session.
- **`state/profile.js`:** new `addShipRecords(profile, id)` (its own empty hold, full hull fraction, stock fit) and
  `ensureShipRecords(profile, id)` (fills in only what is missing). One definition of a complete ship, used by every route that
  adds or selects a hull, so a bought ship and a replacement can never differ in which records exist.
- **`sim/session.js` `die()`:** the lent Wasp and any fallback hull now go through those helpers before `setShip`. The death text
  is unchanged ("The station lent you a spare Wasp.") — it now simply is a fitted Wasp.
- **`sim/economy.js`:** `buyShip` uses `addShipRecords` (same behaviour, one definition); `selectShip` runs `ensureShipRecords`
  first, so a hull that a very old save left without a fit is repaired when the player picks it, not only on the next reload.
- **Tests:** new `tests/ship-recovery.test.mjs` (the lent ship can be equipped and flies with Hull HP, drive and guns; falling
  back to another owned ship keeps its cargo, fittings and damage; the helpers repair a hull missing its records).
  `tests/fixtures/step8b-combat-lifecycle.json` was re-recorded: every snapshot before the death in that run is identical, and
  the post-death snapshots now show a real ship (power, shields, hull, a gun bay, an empty hold) instead of a bare id.
- **Not changed:** mission state. Cargo and mission items still go with the lost ship, so a mission that owed a lost item still
  fails. The `testing/TESTING-DEATH-AND-MISSIONS.md` guide has a new "After a death" section for this.

---

## 2026-11-13: A mission is accomplished by its hand-in, not by its last step; contract wording and colours

Fixes the Border Signal stuck mission and the contract wording. **Save version unchanged (v19)**;
rebuild needed (`npm run build`, then `npm test`).

- **Why:** after the Border Signal's last in-space line the HUD said the mission was done and to return for the reward. Dying
  then lost the beacon, so the reward could never be collected and the mission stayed in the log forever. Contracts announced
  "Mission complete" before their crates were handed in, and called themselves missions.
- **`sim/missions.js`:** `isMissionComplete` is now `missionObjectivesDone` (the steps are finished; the mission is **not**
  accomplished), and the `mission-completed` event is `mission-objectives-done`. The item requirement is now public as
  `missionHandIn`. New `missionLostHandIn` fails (`lost-item`) a mission whose mission-only hand-in exists nowhere, so an
  impossible mission never waits forever. Guidance after the last step comes from `handInNextText`: it names the cargo and
  station and how much is still owed, and says "Contract complete"/"Mission complete" only when there is nothing to hand in.
  Failure messages are the reason only ("Your ship was destroyed."); the notice adds "Contract failed"/"Mission failed".
- **`player-dead`:** a mission whose objectives are done but whose mission-only item is still owed now fails too, with the
  item named. `failMission` grows an `afterObjectives` option so only this "gone for good" case can fail a finished mission;
  timeouts and sector changes still cannot. `abandonMission` uses the mission's own kind in its message.
- **Data:** contract templates now name the station (`{station}`) and declare `handIn.objective` ("Deliver {count} {item} to
  {station}."); Border Signal declares "Return to Meridian Station with the beacon."; the Ore run test mission declares its
  hand-in. Contract missions remember the station they were taken from (`origin`, already a saved field) so field pockets can
  name it. `templates.js` `mission()` accepts `handIn`.
- **`ui/hud.js`, `styles.css`:** contract mission names are light blue (`--ice`), story mission names stay amber.
- **`ui/missionlog.js`, `ui/screens.js`:** the status reads "Ready to hand in" / "Awaiting cargo" / "Complete" and the button
  says "Hand in cargo" when goods are owed; Abandon is always offered when a mission is not ready. The failure notice and the
  mission-log kind label use the mission's kind.
- **Linter (`data/missions/validate.js`):** an item-bearing mission without `handIn.objective` is an error; so is guidance
  that claims completion and any contract guidance that says "mission". Docs: `MISSION_RULES.md` (rules 9 and 10), `LESSONS.md`
  (L15), `ROADMAP.md` (steps 12 and 13 ticked, log), the guides moved to `testing/passed/`, and a rewritten
  `testing/TESTING-DEATH-AND-MISSIONS.md`. Tests: new death/wording/UI/lint regressions; 465/465 pass.

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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
