# Changelog archive

Older entries moved here from [CHANGELOG.md](CHANGELOG.md), word for word, newest first.
You do not need to read this file for every task. `CHANGELOG.md` has a one-line index of everything
in here: open this file only when the index shows an entry that matters to what you are changing
(why a rule exists, how a save version was migrated, what a past fix was).

When entries are moved out of `CHANGELOG.md`, paste them directly under this paragraph so the
newest stay first.

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

---

## 2026-11-10: Keep mission objectives spoiler-safe

- Separated player-facing `objective` text from compatibility/internal `log` text. The HUD and Mission log now use only the data-defined objective, so a procedural trigger such as `wave-clear` cannot reveal a future encounter.
- The Border Signal now tells the player to **Investigate the signal in Kestrel Hollow** and later **Stay with the signal in Kestrel Hollow**, then uses discovery-oriented wording before the return home. Contract templates use data-defined objective placeholders without changing their known requirements.
- Objective text survives the existing v19 save sanitization, and fallback wording for missions without an authored objective no longer exposes internal triggers or step counts. Focused mission/UI tests pass **21/21**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Show player-facing mission objectives in the flight HUD

- Removed internal `Step X of Y` numbering from the Mission log. Active missions now present a clear player-facing status, progress and **Next** instruction instead of exposing the runner's implementation steps.
- The top-right flight HUD now lists every active mission as its title plus the current `missionNextText()` objective. Updated The Border Signal's data-defined text for the Hollow patrol, signal search, beacon retrieval and return to Meridian Station; mission persistence, dialogue, rewards and scripted beacon transfer remain unchanged.
- Added UI/content regressions for hidden step numbering and objective updates across the story flow. Save version remains **19**. Focused UI/content tests pass **61/61**, full `npm test` passes **371/371**, `npm run build` produces a **736 KB** bundle, and the complete-project ZIP is refreshed. Browser validation remains pending in `TESTING-13C-SCREENS.md`.

---

## 2026-11-10: Stabilize story mission completion and scripted hand-offs

- Fixed completed story missions being treated as failed on a later sector change, timeout or death. The Border Signal now remains active and claimable after the pilot returns from Kestrel Hollow, instead of disappearing and reappearing as a fresh **Start** offer.
- Mission-tagged trigger events are now scoped to their owning mission, and scripted item transfers no longer advance when the ship or station cannot take the full amount. Added regressions for the return-home flow, trigger isolation and a blocked beacon hand-off.
- Save version remains **19**. The mission-focused tests and full suite now pass **371/371**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Add pause exit and split the main menu actions

- The pause overlay now places **Exit to main menu** below **Resume**. It saves the current resume point, unpauses and emits the existing UI event path that restores the title screen and hides flight/dialogue overlays.
- The title screen now shows a disabled **Campaign** button followed by **Open World**. Open World deliberately uses the existing `intro` action, so the current open-world resume/deploy behavior is unchanged.
- Added headless menu and pause-navigation regressions, updated the Step 13c browser checklist, and kept save version **19** unchanged. Full `npm test` passes **368/368**; `npm run build` produces a **735 KB** bundle, and the complete-project ZIP is refreshed alongside it.

---

## 2026-11-10: Advance Border Signal after its mission wave

- Mission-spawned waves now emit the configured `wave-clear` trigger automatically when their last ship is destroyed. The runner also counts a reach objective when a later step begins in a place the pilot already occupies, so The Border Signal can proceed after the two Hollow raiders are defeated instead of waiting forever.
- Added regression coverage in `tests/step13b-missions.test.mjs` for the real mission-wave tag, automatic trigger and already-reached search place. Full `npm test` passes **366/366** and the rebuilt bundle is **735 KB**.

---

## 2026-11-10: Build Step 13c mission screens

- Added `src/ui/missionlog.js` with a data-driven Mission log tab for active missions, current step/progress and next-action guidance, plus a live dialogue panel with portrait slot, speaker, text, line controls and choices.
- Story missions can be started from the Mission log's data-defined story list. Dialogue advances through the shared runner and autosaves; the world keeps running unless a mission dialogue step explicitly sets `pause: true`.
- Added v19 round-trip coverage in `tests/step13c-ui.test.mjs`, the browser guide `TESTING-13C-SCREENS.md`, and rebuilt the generated game bundle. Save version remains **19** because the new presentation fields are optional within the existing mission shape.

---

## 2026-11-10: Require mining ore hand-in before contract payout

- Mining contracts now use the same station/ship hand-in path as delivery and Recover contracts. The mined ore must still be available when the reward is collected, then the exact amount is consumed before payout; missing ore keeps the completed mission unpaid and claimable.
- Added regression coverage for missing ore, mixed station/ship stock, payout and consumption.

---

## 2026-11-10: Restore Destroy contract progress readout

- Destroy contracts now show their live `done/total` progress again in both the in-flight Ship HUD and docked Contracts screen. Recover/item missions keep the concise title and reward presentation; inventory-gated reward collection is unchanged.

---

## 2026-11-10: Start Step 13b story mission runtime

- Extended the data-only mission vocabulary and runner with dialogue lines and choices, script actions (spawn wave/ship, sector state, inventory, sound and warp), trigger/timer/area waits, remembered flags with branches, parallel objectives and configured death/leave/timeout failures.
- Added `src/data/missions/story.js` with the ten-step `The Border Signal` worked example. Story progress, dialogue position, flags, timers and per-place script state survive v19 save/load; the future dialogue panel and mission-log tab remain 13c.
- Added headless reference/reachability/completion/failure coverage in `tests/step13b-missions.test.mjs`. Full `npm test` passes **361/361**; `npm run build` succeeds at **724 KB**.

---

## 2026-11-10: Simplify exact pocket route titles

- Starmap and ship HUD route headings now say `Route to Pocket` for exact pocket destinations instead of `Route to System (Pocket)`. Route rows, system destinations and all travel behavior remain unchanged.
- Updated route-display regression coverage and rebuilt the playable bundle after validation.

---

## 2026-11-10: Require salvage delivery before paying recover contracts

- Recover contracts now count only `salv` items from derelict crates. The Contract screen and flight HUD keep active mission rows concise by showing the mission title rather than an extra progress or crate-requirement line; **Collect reward** appears only when the current station/ship has enough items, otherwise the action remains **Abandon**.
- Claiming the reward requires the requested number in the current station or current ship hold; the items are consumed only when the hand-in succeeds, and an incomplete delivery leaves the mission claimable without paying. Existing saved salvage missions gain the explicit delivery item during v19 sanitization. Added headless coverage for missing stock, mixed station/ship stock, consumption and reward payout; the owner playtest checklist now covers the hand-in rule.

---

## 2026-11-10: Show every active mission in the flight HUD

- The top-right Ship HUD now renders every active mission with its individual progress, instead of only the first mission. Added compact styling for multiple mission rows and a regression in `tests/content.test.mjs`.
- The current mission framework, save format and contract behavior are unchanged. Rebuild with `npm run build`; the owner should refresh the playtest preview and check two or more accepted missions in flight.

---

## 2026-11-10: Start Step 13 mission framework with data-driven contracts

- Built Step 13a: `src/data/missions/` defines the mission vocabulary and contract templates, while `src/sim/missions.js` advances kill, mine, collect, reach, deliver and survive objectives from gameplay events. Mine, hunt and salvage contracts now run through the same one-step mission records, and several missions can be active at once without changing their wording, rewards or spawn behavior.
- Save version is **19**. `profile.missions` and `profile.flags` replace the old single active contract slot; v18 and older active contracts migrate, and the non-enumerable `profile.mission` view keeps old callers/exported character checks compatible. Dialogue/script steps and mission-log/dialogue screens remain for 13b/13c.
- Added `tests/step13-missions.test.mjs` and `TESTING-13-MISSIONS.md`. Full `npm test` passes **352/352**; `npm run build` succeeds with a **713 KB** bundle (the generated HTML is restored after validation).

---

## 2026-11-10: Simplify map markers and current-location labels

- Removed the extra orange start ring around the current galaxy system and current pocket, including station squares; current labels now add a second `(You are here)` line.
- Removed bottom starmap/pocket-map status warnings, including already-there and late travel-denied messages. Route rows in both the ship HUD and starmap now have a faint connecting line between their markers.
- Simplified destination markers to a very dark filled circle with an orange check and one dotted orange ring. Exact pocket route headings now use `Route to System (Pocket)`.
- Targeted starmap/HUD tests pass **50/50**; full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and returns HTTP 200 on the existing preview server.

---

## 2026-11-10: Refine destination marker rings and icon scale

- Destination icons now use a small orange tick, two orange rings and a dotted outer orange ring, matching the supplied reference more closely in route rows and galaxy/system pocket SVG maps.
- Current/start and destination route icons are about 20% smaller; intermediate markers and route behavior are unchanged.
- Targeted starmap/HUD tests pass **50/50**; full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and returns HTTP 200 on the existing preview server.

---

## 2026-11-10: Mark destination completion and remove HUD route scrolling

- Destination markers now include a bright tick inside the concentric amber target in both the HUD/starmap route rows and the galaxy/system pocket maps; the filled amber start marker is unchanged.
- The ship HUD renders the complete route without an inner scroll container or scroll-position restoration. Map route pagination remains unchanged.
- Added coverage for the SVG/CSS tick treatment and the non-scrolling HUD list. Targeted starmap/HUD tests pass **50/50**; full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and returns HTTP 200 on the existing preview server.

---

## 2026-11-10: Add route markers and instant galaxy selection

- Shared HUD and starmap route rows now use a filled amber start marker, small blue intermediate markers and a concentric amber destination marker. The same roles are drawn on route systems and route pockets, preserving the existing solid/dotted route lines.
- Selecting a system with one click in the large galaxy chart is immediate; pocket/gate double-click protection remains in place.
- Added marker and immediate-selection regressions. Full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed browser preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and still needs the next live check.

---

## 2026-11-10: Clarify pocket menus, labels and exact route destinations

- Pocket-map context menus now open immediately to the right of the pointer with **Set destination** as the nearest action; existing legality checks, Warp actions, refusal notices and double-click navigation remain intact. Successful destinations in either map mode no longer add the generic bottom `Destination set. Press J for the next warp.` notice.
- `pocketLabelLayout` keeps pocket names off nearby dots and separates colliding names, drawing a connector when a name moves; the crowded Galedrift Fallowwatch label now sits to the right of its dot instead of reading as Sablewatch's.
- The shared HUD/starmap route rows append the destination pocket in a small parenthetical on the final system row only for `{ pocketId: ... }` destinations; system destinations remain system-only.
- Added menu, notice, label-layout and route-row regressions. Full `npm test` passes **347/347**; `npm run build` succeeds at **703 KB**. The refreshed browser copy is in `/tmp/tallow-reach-preview/game/tallow-reach.html`; owner live-browser confirmation is still pending.

---

## 2026-11-10: Make local route lines solid and pocket menus right-click-only

- Destination overlays on the large galaxy map are solid orange with directional arrows again. On a system pocket map, planned local pocket-to-pocket hops are solid orange; only the cross-system gate exit stubs remain orange dashed, including the incoming stub highlighted in reverse when viewing an intermediate system.
- Left-clicking a pocket or gate exit in a pocket map is now inert. Right-clicking still opens the existing Warp/Set destination menu, and double-clicking gate targets still opens the adjacent system map.
- Added exact Meridian → Galereach → Galedrift overlay coverage and left/right-click menu coverage. Step 11B passes **45/45**; full `npm test` passes **347/347** and `npm run build` succeeds at **701 KB**.

---

## 2026-11-10: Preserve real double-click navigation on starmap dots

- A first click on a galaxy system, gate exit dot or gate pocket no longer immediately replaces the SVG target with a popup. The short single-click delay lets the browser deliver the second click to the same node, so double-clicking Galereach or another adjacent gate now opens that system map; a single click still selects or opens its existing menu.
- Added a regression that sends real click details through both the Galereach system dot and a Meridian gate exit. Full `npm test` passes **346/346**; Step 11B passes **44/44**; `npm run build` succeeds at **701 KB**.

---

## 2026-11-10: Vary station names and clarify routed gate navigation

- Generated trader features and their station pockets now receive deterministic, varied names such as Outpost, Hideout, Trading Hub, Waystation, Exchange and Freeport. Names remain unique across the resolved catalog while authored station names stay intact.
- Double-clicking either a neighbouring-system label or the gate pocket itself now opens that adjacent system's pocket map, including rapid clicks during the zoom transition.
- Active destinations now draw orange dashed route overlays with small directional arrows on galaxy links, local pocket hops and the gate exit that leaves the current system. Added regression coverage for station-name uniqueness, gate-pocket navigation and directed route overlays.
- Full `npm test` passes **345/345**; `npm run build` succeeds at **700 KB**. Save version and route rules remain unchanged; the owner browser playtest is still pending.

---

## 2026-11-10: Refine system-map exits and separate generated station pockets

- System-map gate exit stubs and their remote endpoint dots now use the pocket blue instead of amber. Visited knowledge remains saved, but visited systems no longer receive a light-blue visual treatment. Double-clicking a neighbouring-system gate label while in a system map switches directly to that peer's map.
- Generated friendly traders selected by gate templates are removed from gate pockets and placed in deterministic `${gateId}-station` pockets with an internal hub link. Explicit station feature records, `allowStation: true` or `stationPlacement: "gate"` preserve deliberate future gate co-location. Station pockets render as square map icons.
- Added regression coverage for colors, visited presentation, direct remote-map navigation, square station icons, default station/gate separation, explicit co-location and old docked gate-station save migration. Save version remains **18**; `npm test` now passes **345/345** and `npm run build` succeeds at **698 KB**. Step 12 remains unticked pending the owner visual playtest.

---

## 2026-11-10: Give every dockable station local persistent inventory

- Station storage is now keyed by the stable `${placeId}:${featureId}` identity of the active dockable station. Inventory transfers, purchases, sales, fitting/unequipping, storage capacity, shop ownership/room presentation and station switching all resolve the active station stock; trader stations still use Meridian's `SHOPS` definitions and economy rules.
- `world.stationStores` is saved for every station, while the enumerable `world.store` remains a home-station compatibility alias. Existing v18 saves without `stationStores` migrate their old stock to the saved station where possible. Save version remains **18** so the reserved Step 13 v19 and Step 15 v20 slots stay intact; `tr1`, `tr_s1..tr_s3` and `TR1:` are unchanged.
- Added `tests/station-inventory.test.mjs` for cross-station isolation, shop/capacity/sell behavior, fitting context, export/reload and legacy migration. `npm test` passes **343/343** and `npm run build` succeeds at **696 KB**. Step 12 remains unticked pending owner confirmation.

---

## 2026-11-10: Build Step 12 encounter templates and persistent place memory

- Generated pockets now resolve three data templates with tier-selected `hostile_patrol`, `friendly_trader`, `derelict` and `resource_cache` encounters. They are filled on load; trader stations are dockable and reuse Meridian's existing `SHOPS` stock. Generic AI spawning keeps hunt-contract selection without a raider-only branch.
- Stable asteroid field slots, cleared static loot encounters and one-shot patrol groups use `world.placeMemory` with a 420-second simulation-time default. Pausing does not advance timers; `respawn-place` can force a future event-driven respawn. Save version is **18**, with v17-and-older migration defaults.
- Added `tests/step12-places.test.mjs`, expanded content-reference checks, `TESTING-12-PLACES.md`, and updated architecture/roadmap/handoff documentation. `npm test` **341/341**; `npm run build` succeeded (**694 KB**). Owner playtest is pending; Step 12 is not ticked yet.

---

## 2026-11-08: Wrap destination names and show local route hops

- Owner requested long starmap destination names wrap instead of truncating, and orange route lines
  between pockets on each relevant system map. The route heading and pocket rows can wrap; the panel
  remains non-scrolling and existing route pagination measures the available space. An arrowed orange
  segment represents each consecutive same-system pocket hop in the currently executable route,
  including free-warp and route-only systems. Cross-system hops do not invent internal lines. Overlay
  updates as routes change, disappears if unavailable/cleared, and does not intercept clicks.
- Updated starmap markup, styles, regression tests and playtest guide. Full **334/334**, build
  **686 KB (702,037 bytes)**. Save v17 and one-checked-warp-per-J rules unchanged; browser playtest pending.

---

## 2026-11-08: Remember route destinations across relogs

- Owner reported that destinations were lost on relog and requested an in-chat playtest. Save **v17**
  stores `world.destination` (system id or `{ pocketId }`, null if unset). Setting/clearing a target
  autosaves immediately; slot saves and export codes include it. The route itself is recalculated from
  the restored location, and J still performs exactly one checked warp. Arrival clears and autosaves it.
- `prepareGalaxySave` validates against the saved seed, drops invalid/removed targets and already-reached
  destinations, and migrates v16 and earlier with no destination; existing cargo/progress remain intact.
  Chart framing is still session-only. Added save/restore and actual map/J/arrival regression coverage.
- `npm test` **333/333**, build **685 KB (701,251 bytes)**; live preview provided, owner playtest pending.

---

## 2026-11-08: Remove destination diamond

- Owner requested removing the diamond from the destination system. Both route lists retain the
  amber bold destination styling, arrows and blue current-system styling; an accessible destination
  label remains. No navigation or save changes.
- Updated route markup, styles, tests and checklist. Targeted **44/44**, full **331/331**, build
  **684 KB (700,815 bytes)**. Browser playtest pending.

---

## 2026-11-08: Mark the route destination and simplify the starmap list

- Owner requested the final system stand out, and that starmap route rows show only systems and arrows
  like the flight HUD, without grey gate-to-gate pocket details. Both lists now highlight the destination
  in amber with a diamond; the current system stays blue, even when it is also the destination. The map
  still shows the exact pocket target in the heading, and its paging and highlighted graph remain intact.
  Neither list shows completed systems; unused session-only route-history tracking was removed.
- Updated route presentation, starmap, styles, tests and checklist. Targeted **44/44**, full **331/331**,
  build **685 KB (700,929 bytes)**. No travel or save changes; browser playtest pending.

---

## 2026-11-08: Add route arrows to the flight HUD

- Owner requested the starmap-style arrows beside the flight route's system names. Each remaining
  system now has an amber arrow; the current system name stays blue. The count and starmap are unchanged.
- Updated route markup, HUD style, tests and checklist. Targeted **44/44**, full **331/331**, build
  **686 KB (702,025 bytes)**. No save or travel changes; browser playtest pending.

---

## 2026-11-08: Simplify the flight route to system names

- Owner requested only remaining system names in flight, with the current system highlighted blue,
  no completed ticks, and “Route to … (N systems)” showing how many system entries remain beyond
  the current system. An exact pocket destination remains named in the heading. If routing is blocked,
  no count is guessed; the current system and no-route message remain visible. The detailed starmap,
  including its pocket names and completed-system history, is unchanged.
- Updated the shared route renderer and HUD, tests, and owner checklist. Targeted **44/44**,
  full **331/331**, build **685 KB (701,942 bytes)**; browser playtest pending. No save or travel changes.

---

## 2026-11-08: Set exact pocket destinations

- Pocket and gate-neighbour popups now offer **Set destination** below the Warp button or refusal note,
  including for a pocket that cannot be reached in one hop. The neighbour label selects its reciprocal
  gate pocket. Selecting the current pocket or an unreachable pocket reports why without replacing a route.
- Shared executable breadth-first search now also finds the fewest legal, cost-supported warp hops to
  an exact pocket. `J` still starts one checked hop and replans each time. Pocket destinations stay active
  on entry to their system and clear only when the exact pocket is reached. The route list names that final
  pocket; galaxy-system destinations and their arrival-gate behaviour remain unchanged.
- `src/sim/travel.js`, `src/sim/navigation.js`, `src/ui/starmap.js`, `src/state/state.js`, tests, playtest
  guide and architecture notes updated. Session-only destination remains outside save v16. Targeted tests
  **60/60**, full `npm test` **322/322**, build **677 KB (693,443 bytes)**; browser playtest pending.

---

## 2026-11-08: Clearer, sparser starmap and adaptive route list

- Owner asked for galaxy connections not to pass through unrelated system dots, route stops to use the
  available vertical space before paging, and outer systems to need at least 10 jumps. Owner explicitly
  chose to update existing saves too, safely relocating removed gate-pocket saves within the same system.
- `organic-web-v2` retains seeded system ids, names, positions and core rolls but builds a sparse radial-
  depth tree, default `extraChance: 0` and `depthRadiusFraction: 0.08`. Default seed: 121 systems,
  362 pockets, 361 links, 120 gate links; its outer 80%-radius systems need at least 10 gate crossings
  (11+ across 500 sampled seeds). Custom graph tuning/overrides may change this. The v1 generator is
  retained to identify prior generated gate IDs. `prepareGalaxySave` moves a removed old gate to an
  ordinary pocket in its same system, clears old coordinates and preserves profile/cargo; truly unknown
  pockets still recover home. Recovery notices name the destination; save schema remains v16.
- `src/ui/chart-lines.js` finds chart-only polylines around system dots, with an SVG dot mask for extreme
  overlaps. Highlighted routes use exactly the same paths; connections and travel rules remain data-driven.
  The right route list measures available space and shows all stops that fit; arrow pages only appear if
  needed, including after resize. The overview panel does not scroll.
- Added seeded distance/geometry and legacy-save recovery tests; updated map/playtest docs and removed
  tests' assumptions about old neighbours. Targeted 63/63, full `npm test` **325/325**; build **681 KB
  (696,881 bytes)**. No visual browser verification; owner playtest remains pending. No new dependencies.

---

## 2026-11-08: Straight starmap lines with attached endpoints

- Owner asked for straight lines without unrelated-dot intersections, and asked about light-blue systems.
  Light blue denotes a system marked visited in saved discovery knowledge; orange is the current system.
- Replaced bent lines and the blanket endpoint mask with a cached, chart-only layout that nudges unrelated
  dots away from straight gate segments. Paths and highlighted routes use the same single straight segment;
  connected endpoint dots are never globally masked. In unusually crowded or extreme-zoom layouts, an
  individual line masks only its unrelated obstructing dots. Chart positions never mutate simulation
  geography, graph, saves or authored positions; the layout is recalculated on graph/position changes,
  not when gates are merely closed or reopened. The pocket view and zoom centering use the same chart
  projection. All system identities and connections remain unchanged.
- `src/ui/chart-lines.js`, `src/ui/starmap.js`, starmap regression tests and documentation updated.
  Targeted **64/64**, `npm test` **326/326**, build **681 KB (697,419 bytes)**. No dependencies or save
  version changes; browser playtest remains pending.

---

## 2026-11-08: Show the active route in flight

- Owner requested the route destinations beneath the left boost bar. The flight HUD now shows the
  same remaining system stops and exact-pocket destination as the starmap, plus the J hint or no-route
  status. Long lists scroll independently; mouse wheel and clicks on the list do not control the ship.
  It hides when cleared or reached, updates immediately on place/destination changes and rechecks
  travel conditions twice a second. Route display does not change travel, progress or save data.
- Added shared `src/ui/route-display.js`, HUD markup/styles and `tests/hud-route.test.mjs`.
  Targeted **41/41**, full **328/328**, build **683 KB (699,351 bytes)**. Browser playtest pending.

---

## 2026-11-08: Group route pockets by system and mark the current area

- Owner clarified that routes should retain one row per system, with all internal pocket hops in
  order within that row. Both the flight HUD and starmap now show the current pocket marked “here”
  in its system row and also keep a current-area label visible above the list, including when paged
  or no route is available. Entering another system starts a new row; a later revisit starts another.
- The starmap measures wrapped system rows to paginate without hiding long pocket lists. The flight
  route keeps its current-area label visible while the system rows scroll. No travel rules or saves changed.
- Updated shared route presentation, HUD/starmap styles, regression tests and the owner checklist.
  Targeted **42/42**, full **329/329**, build **684 KB (700,547 bytes)**. Browser playtest pending.

---

## 2026-11-08: Compact flight route with journey progress

- Owner chose the compact system-list idea: in flight, show one row per system and its remaining
  departures, with pocket names only in the current system. The current pocket is marked “here”.
  Actually crossed systems are retained and checked off, including manual detours/revisits; the rest
  replans from the current pocket. Counts mean warp jumps departing that system (including its gate
  crossing), so a system destination may show zero. The current row scrolls into view on a hop.
- The starmap retains full pocket details and also shows checked-off systems. Journey history is
  session-only, reset when a destination is replaced, cleared, reached or a save is loaded. The
  navigation rules, one-hop J and saved data are unchanged; a blocked route shows its current area
  and no-route message until it becomes available again.
- Updated HUD, shared route display, transient state, starmap and regression tests. Targeted **43/43**,
  full **330/330**, build **686 KB (702,040 bytes)**. Browser playtest pending.

---

## 2026-11-08: Step 11B starmap UI follow-up — zoomed system maps, right-click warp, compact overview (owner playtest pending)

Owner reviewed the first 11B build ("the map looks ok") and asked for four chart changes. This is a
follow-up inside 11B, not a new numbered step; step 11 remains unticked until `TESTING-STARMAP.md` passes.

- Zooming into a selected system dot (wheel/+ past `map.systemEntryZoom`, or double-click) now opens a
  **system pocket map** with a short galaxy↔system viewBox transition. `sim/galaxy.js` gains
  `systemPocketLayout`: a deterministic, derived 2D layout (ordinary hub centred, other ordinary pockets
  ringed, gate pockets placed outward toward their peer system). Author `mapPos` overrides are validated
  and win; layout is never saved. `ui/starmap.js` draws internal pocket lines and dashed gate exit stubs
  labelled with the neighbouring system, respecting enabled links and the visibility policy.
- **Right-click a pocket** (or Enter/Space/Shift+F10 on a focused pocket dot) opens a small popup with a
  clickable **Warp to …** only when `travelQuote` says the direct hop is legal. It emits the same
  `action { name: "travel", to }`; `main.js`/`startWarp` still recheck link/cost/requirements and run the
  unchanged warp animation. Illegal/current pockets show a reason and no warp button. Esc closes the
  popup before the chart; the root handler stops propagation so the global contextmenu/fire gates stay intact.
- The right panel is now a compact overview: system name, **Current pocket**, and plain pocket-name rows.
  Removed the per-pocket tier/description/gate-peer/status cards and all panel warp buttons; no scrolling.
- Tuning lives in `src/data/galaxy.js` (`map.systemEntryZoom`, `map.transitionMs`, `map.context`,
  `systemMap` radii/padding/exit length/zoom). Updated `src/styles.css`, folder READMEs, HANDOFF/ROADMAP/
  VISION/REFACTOR_PLAN/ARCHITECTURE/TARGET_ARCHITECTURE/HOW_TO_ADD and root `TESTING-STARMAP.md` sections 2–3.
- Tests: updated the old map-UI assertion that expected panel warp buttons, and added layout/exit/visibility,
  transition, zoom-entry/exit and illegal-popup coverage. `tests/step11b-starmap.test.mjs` is now 25 tests.
- **Results:** `npm test` **304/304 pass** (both 8b oracles unchanged); `npm run build` succeeded
  (662 KB, 677,847 bytes). **Save v16 unchanged** — pocket layout is derived, not persisted; no migration,
  storage-key or `TR1:` change. No new dependencies. Automated headless DOM checks passed; owner visual
  browser playtest pending. Rebuild with `npm run build`; test with `npm test`.

## 2026-11-08: Plot system destinations and jump the route with J

- Right-click a visible galaxy system for **Set destination** and, only when the current pocket has an
  executable direct gate to that system, **Warp to**. Keyboard context-menu keys work too. A highlighted
  galaxy path and arrowed remaining system stops (including the destination arrival gate) appear below
  the pocket rows. Long routes use paging so the panel need not scroll; Clear removes the destination.
- `findRouteToSystem` does a breadth-first search over executable pocket hops, ending at whichever pocket
  reaches the target system in the fewest warps. It respects free/local link policy, enabled links,
  registered warp mode, requirements and unsupported costs. `J` in flight calls `jumpRoute`, recalculates
  the route and calls `startWarp` for **one** hop; local gate and crossing are separate presses. Warp
  animation and rechecks remain unchanged. No destination/route gives HUD feedback; arrival clears the
  destination. Unreachable destinations do not replace an existing one. No auto-chaining.
- Destination is session-only and resets on save replacement; save v16 and dependencies are unchanged.
  Changed `src/sim/travel.js`, new `src/sim/navigation.js`, map/input/main/state/styles/help, tests and
  root `TESTING-STARMAP.md`. `npm test` **320/320** and build **676 KB (692,538 bytes)**; browser
  playtest remains pending, and step 11 is still unticked.

---

## 2026-11-08: Remember starmap view across closing and travel

- Owner confirmed the cannon visual follow-up works. Map M-close/reopen now restores the last galaxy or
  system view, selection, zoom/pan and label setting; popup/notice/transition/drag do not persist.
  A local cross-system `place-changed` makes a remembered pocket view follow the destination system and
  resets its pocket framing, while galaxy mode remains galaxy mode. Local same-system hops preserve
  framing; other pilots do not alter local memory. Reopen also checks current location as a fallback.
  Hidden systems are not exposed. Save replacement resets memory; it is session-only, not in save v16.
- Changed `src/ui/starmap.js`, `src/state/state.js`, `tests/step11b-starmap.test.mjs`, root playtest
  guide and architecture/handoff notes. Headless tests cover both views, real local and gate warps,
  stale menus, cross-player isolation, fallback and save reset. `npm test` **316/316**, build **670 KB
  (686,176 bytes)**. Browser playtest pending; step 11 remains unticked.

---

## 2026-11-08: Align newly fired cannon visuals with the interpolated hull

- Owner reported cannon output visually offset when thrusting and turning. The local hull renders
  between ticks, while a new bullet was first rendered from the already-advanced simulation muzzle.
  The view now initializes its first previous pose at the corresponding previous hull-local muzzle,
  then interpolates to the real projectile position. Subsequent ticks use normal projectile interpolation;
  teleports and enemy shots are excluded. This is presentation only: ship velocity inheritance, firing,
  damage, collision and saves are unchanged. Inherited velocity can still cause drift after firing.
- Added moving/stationary, left/right, first/subsequent tick, teleport and enemy-shot headless checks in
  `tests/render-interp.test.mjs` and a browser check in root `TESTING-STARMAP.md`. `npm test` **314/314**;
  `npm run build` **669 KB (685,250 bytes)**. Visual browser verification remains pending.

---

## 2026-11-08: Tame galaxy chart drag speed

- Owner reported that tiny drags moved the map far too much at every zoom. Removed the old
  viewport-dependent inverse-square amplification: `galaxyPanDelta` now converts pointer movement
  to viewBox units once. `map.panSpeed` sets the maximum screen travel per pointer pixel (default 1);
  the multiplier rises smoothly from 0.5 at maximum zoom to 1 at minimum zoom. Thus zooming out still
  pans farther, but no default drag moves the chart farther on screen than the pointer. System-map
  panning, travel, saves and dependencies are unchanged.
- Updated the starmap regression test to check screen-space travel across zooms and different viewport
  shapes, and updated `TESTING-STARMAP.md` and current architecture/handoff notes. `npm test`: 312/312;
  `npm run build`: 669 KB (684,972 bytes). Owner visual playtest remains pending.

---

## 2026-11-08: Step 11B starmap refinements — permanent core labels, zoom-scaled pan/cores, clickable gate neighbours (owner playtest pending)

Owner requested six small chart changes after the free-local-warp/central-body delivery. This remains
inside step 11; the owner has not yet passed the updated root `TESTING-STARMAP.md`.

- **Tooltips/popups:** removed native `<title>` hover tooltips from pocket nodes and central bodies;
  galaxy system dots keep their title for hidden-label inspection. The blue/orange click popups remain.
- **Permanent core labels:** every star/black hole shows its proper name below the graphic with
  `(Star)` / `(Black hole)` on a second row; hover/focus still highlights the ring/glow but no longer
  gates the label. The core remains a non-warpable `role="img"` chart object.
- **Galaxy pan:** `map.panSpeed` anchors the previous max-zoom drag feel. `galaxyPanSpeed` /
  `galaxyPanDelta` make on-screen pan distance grow as `maxZoom / zoom` when zooming out, while
  system-map panning stays unchanged.
- **Gate-label clarity:** `pocketLabelPosition` puts gate pocket names inward, away from the orange
  exit stub and peer-system label; ordinary pockets keep outward radial labels. Peer labels sit beyond
  the stub cap with a tunable gap.
- **Zoom-scaled cores:** `systemMap.coreRadius` / `blackHoleRadius` are now map units, so the central
  graphic grows with system zoom. Pocket dots and label text remain screen-sized; label offset/line-height
  and gaps are tunable (`coreLabelOffset`, `coreLabelLineHeight`, `labelGap`).
- **Clickable gate neighbours:** exit stubs are focusable buttons. Clicking/right-clicking/keyboard-
  activating a neighbouring-system label opens the same popup and quotes `travelQuote` to the reciprocal
  gate pocket (`exitChoice`), never the remote system/core. Unreachable hops show **No direct route**;
  legal hops emit the unchanged named travel action so `main.js` / `startWarp` requote before warping.
- **Files:** `src/ui/starmap.js`, `src/styles.css`, `src/data/galaxy.js`, `src/sim/galaxy.js` validation,
  `tests/step11a-galaxy.test.mjs`, `tests/step11b-starmap.test.mjs`, root `TESTING-STARMAP.md`, README,
  HANDOFF/ROADMAP/VISION/REFACTOR_PLAN/ARCHITECTURE/TARGET_ARCHITECTURE/HOW_TO_ADD and data/UI READMEs.
- **Results:** `npm test` **312/312 pass** (11A 23, 11B 29; both 8b oracles unchanged); `npm run build`
  succeeded (**669 KB, 685,046 bytes**). **Save v16 unchanged:** no layout/pan/core presentation state enters
  saves; default geography remains **121 / 462 / 511** with 116 stars and 5 black holes. No new dependencies.
  Automated headless checks passed; owner visual browser playtest remains pending. Rebuild with
  `npm run build`; test with `npm test`.

---

## 2026-11-08: Step 11B system-map follow-up — free local warp and named central bodies (owner playtest pending)

Owner requested three changes after the zoom/right-click UI delivery. This remains inside step 11;
the owner has not yet passed the updated root `TESTING-STARMAP.md`.

- **Free open-world local travel:** `sim/travel.js` allows warp to any pocket in the same system by
  default, including a gate, without an internal link. `travelOptions`, `findRoute` and galaxy validation
  understand the policy. A system can opt into `intraSystem: "links"` (data override/future temporary
  instance) to require connected internal routes again. Cross-system travel still needs the exact enabled
  gate link and its mode/requirements. `startWarp` still requotes before the unchanged warp sequence.
- **System-chart clarity:** `ui/starmap.js` omits internal blue lines only in free-warp system maps;
  route-only systems still draw enabled internal links. The main galaxy's gate web is unchanged. Gate
  stubs still point to and name their exact peer system. The compact name-only right panel is untouched.
- **Central bodies:** `sim/galaxy.js` assigns a visual-only star/black hole per system using an independent
  FNV-1a + seeded roll (`systemMap.blackHoleChance: 0.05`). Author `core: { kind, n }` overrides win; names
  default to the system's proper name (Meridian System → Meridian). Pockets now orbit the empty centre:
  ordinary radius 140, gate radius 280, with authored `mapPos` still winning. The SVG core has distinct
  star/black-hole styling and a hover/focus name, but no pocket id, warp action or route endpoint.
- **Data/validation:** `data/galaxy.js` documents the policy/core recipes and adds core chance/radii/label
  tuning. Invalid policies, core kinds and tuning fail plainly. Core assignment consumes neither the
  generator nor gameplay RNG stream. Default ids, system positions, pockets and links are unchanged:
  **121 / 462 / 511**, with 116 stars and 5 black holes on the default seed.
- **Tests/docs:** re-scoped old local-link refusal/layout assertions to the explicit links opt-out rather
  than deleting them; added free-hop/gate isolation, policy connectivity, core chance/name/override,
  non-warpable markup/focus styling and unchanged galaxy-route coverage. `step11a-galaxy.test.mjs` now
  has 23 tests and `step11b-starmap.test.mjs` 27. Updated the root playtest guide, HANDOFF/ROADMAP/VISION/
  REFACTOR_PLAN/ARCHITECTURE/TARGET_ARCHITECTURE/HOW_TO_ADD and data/sim/UI READMEs.
- **Results:** `npm test` **310/310 pass**; `npm run build` succeeded (**666 KB, 682,414 bytes**).
  **Save v16 unchanged:** no generated geography, policies, cores or layout enter saves; old saves/codes
  and both 8b oracles still pass. No new dependencies. Automated headless checks passed; owner visual
  browser playtest remains pending. Rebuild with `npm run build`; test with `npm test`.

---

---

## 2026-11-08: Step 11B — clickable starmap, direct-hop travel and save v16 (owner playtest pending)

Owner-approved second slice of step 11. **M now opens the starmap** instead of warping immediately;
step 11 remains unticked until the owner passes `TESTING-STARMAP.md`.

- Added `src/ui/starmap.js` (visible system web, gate lines, current/visited/selected markers, inspect
  dropdown, zoom/pan/labels, selected system's full pocket list and travel quotes) and
  `src/sim/galaxy-session.js` (seed resolution, live place catalog installation, compact-save
  preparation and removed-pocket recovery). `src/data/places.js` lookups now read the live catalog;
  `src/main.js`, `src/core/input.js`, `src/ui/menu.js`, HUD/intro text and styles wire the chart.
- Travel buttons emit `action { name: "travel", to }`; `sim/sectors.js` requotes the direct link,
  costs and requirements before running the unchanged warp sequence. Refusals emit `travel-denied`
  and remain visible in the chart. Single-player chart pauses via `isSimulationPaused()` and releases
  flight input/free cam/dock-lock-weapon hotkeys/audio; `state.multiplayer` keeps a future hosted world running.
- **Save v16:** `world.galaxy` stores only `{ seed, knowledge }`, not generated geography. Boot, slots
  and import prepare the saved seed before validation; v15 and older migrate. A removed/unknown pocket
  returns the pilot to Meridian Station docked with the whole character/cargo intact and a recovery
  notice. Failed preparation restores the previous catalog. Storage keys and `TR1:` are unchanged.
- Added `tests/step11b-starmap.test.mjs` (21 tests) and `tests/saves/v15-pre11b.json` (pre-11B
  regression fixture, not a new owner export). Updated intentional v16/pause expectations in the
  existing save/resume/shop tests; legacy `nextPocket` tests remain as helper oracles. Added old-code
  section C to `TEST-OLD-CODES.txt`, root `TESTING-STARMAP.md`, and updated HANDOFF/ROADMAP/VISION/
  REFACTOR_PLAN/TARGET_ARCHITECTURE/ARCHITECTURE/HOW_TO_ADD and folder READMEs.
- **Results:** `npm test` **300/300 pass** (both 8b oracles unchanged); `npm run build` succeeded
  (650 KB, 665,730 bytes). Automated headless DOM/menu/input/audio checks passed; owner visual browser
  playtest pending. No new dependencies. Rebuild with `npm run build`; test with `npm test`.

---

## 2026-11-08: Step 11A owner playtest passed — full project backup

- The owner reported the `TESTING-11A.md` playtest passed; no bugs were reported. Recorded the pass
  in the guide, HANDOFF, ROADMAP and REFACTOR_PLAN. **Step 11 remains unticked:** only slice 11A is
  confirmed; 11B has not started. No source, gameplay or save-format change; saves remain v15.
- Delivered `tallow-reach-step11a-passed-backup.zip` outside the project folder: full source, tests,
  docs, package files, reference and the built HTML, excluding installed dependencies and Git internals.
  Browser-local saves are not in a project ZIP; use Saves -> Export for a separate `TR1:` progress backup.
- Latest recorded verification before this docs/backup change: build succeeded (625 KB), **279/279
  tests passed**. Moved the six oldest full entries below to the archive verbatim, leaving ten.

---

## 2026-11-08: Step 11A owner playtest guide and live browser preview

- Added `TESTING-11A.md` (project root, beside the other playtest guides): a numbered regression
  checklist for the 11A build. 11A is invisible by design, so the guide checks that nothing changed —
  M still warps directly (no map screen), Kestrel Hollow stays empty and is not a gate, saves stay v15,
  old codes A/B still import — plus flight, mining, combat, station business and console-error checks.
- Started the existing `node serve.mjs` preview server (port 8080) so the owner can play the built game
  in the browser. No source or gameplay change; `serve.mjs` is unchanged.
- Re-ran `npm ci` (sandbox had lost `node_modules`), `npm run build` (625 KB) and `npm test`:
  **279/279 pass**. Awaiting owner playtest results before starting step 11B.

---

## 2026-11-08: Step 11A — organic starmap web, one-peer gates and editable travel rules

Owner-approved first slice of step 11. The map is an organic 2D web, not a square grid; construction
must stay modular so moving a system, deleting a pocket, promoting a pocket to a gate, adding a route
or replacing the generator does not require rewriting map/UI/warp code.

- Added `src/data/galaxy.js` (seed, 121-system target, degree cap, organic layout, visibility policy,
  advisory distance tiers, empty travel cost/requirements, `GALAXY_OVERRIDES`, name parts),
  `src/sim/galaxy.js` (replaceable generator registry, resolved system/pocket/link records, author
  patches/tombstones, validation, visibility policies) and `src/sim/travel.js` (pure direct-hop
  quotes/options/route search with registered modes/requirements). `src/data/places.js` gains explicit
  `PLACE_LINKS` for the authored Meridian Station <-> Kestrel Hollow route.
- Each generated system has one ordinary empty pocket and one empty gate pocket per neighbouring
  system; every gate pocket has exactly one external gate peer. Meridian keeps `reach`/`hollow`
  unchanged and gains separate new gate pockets. Kestrel Hollow is not a gate.
- Added `tests/step11a-galaxy.test.mjs` (19 tests): determinism, independent RNG, organic scatter,
  dead ends/junctions, reachability, one-peer gates, move/delete/promote overrides, generator
  replacement, configurable visibility, tier guidance, tuning changes and free/closed travel.
- **No live gameplay or save change:** M still cycles the current system's pockets, save stays **v15**,
  and the new modules are not imported by `main.js`. Step 11B will wire the M starmap/pocket chooser and
  save v16. Updated VISION decisions, ROADMAP, REFACTOR_PLAN, TARGET_ARCHITECTURE, ARCHITECTURE,
  HOW_TO_ADD recipe 20 and the data/sim folder READMEs.
- **Results:** `npm ci` succeeded; `npm test` **279/279 pass** (260 baseline + 19 new; both 8b oracles
  unchanged); `npm run build` succeeded.

---

## 2026-11-08: Autosave every 30 seconds instead of 15

Owner request: halve how often the game writes a save, to keep write volume down.

- `AUTOSAVE_SECONDS` in `src/data/simulation.js` is now **30** (was 15). It is the only tuning number
  involved; `main.js` already reads it.
- Nothing else changes. Saving on tab hide/close, on dock, on warp arrival and on every menu click is
  untouched, so a normal quit still loses nothing — the interval only bounds what a **crash or
  force-quit** can lose, which is now up to 30 seconds of flying instead of 15.
- `docs/HANDOFF.md` and `TESTING-PLACES.md` step 4.8 updated to say 30 seconds. The dated v15 entries
  below still say 15 s because that was true when they were written.
- **Results:** `npm test` **260/260 pass**; `npm run build` succeeded.

---

---

## 2026-11-08: Come back where you logged out — save v15

Owner request: quitting while flying in the Meridian Station pocket docked you on the way back in.
`resumeFromSave` asked only "does this pocket have a station?", so any flight inside `reach` came back
docked. The owner chose **exact spot, with the arrival point kept as the fallback**, reasoning that
pockets may grow large and being sent back to the entry point every time would be tedious.

- **Save v15** adds `world.resume`: `null` while docked, otherwise `{ pos, quat, sh, en }` — the exact
  spot and heading plus shield and boost levels. `sanitizeWorld` rejects anything non-finite, the
  wrong shape, or beyond `PLACE_EXTENT` (`data/places.js`), and normalises a non-unit heading, so a
  damaged or hand-edited code can never place the ship somewhere impossible.
- `resumeFromSave` (`sim/session.js`) returns the pilot to that spot **stationary**, with shields and
  boost **as they left them** (the default taken where the owner did not choose — quitting is not a
  free repair). Fallbacks: no resume point (v14 and older) keeps the old dock-or-arrival behaviour; a
  rejected position falls back the same way; and a ship with no thrusters that would be stranded
  outside docking range is put back at the station instead.
- `captureResume()` in `state/state.js` is called by `currentSave()`, so **every** save path — autosave,
  slot and export code — records the live position rather than a stale one.
- The game now also saves when the tab is hidden or closed (`pagehide`, `visibilitychange`) and every
  `AUTOSAVE_SECONDS` (15, in `data/simulation.js`). Previously it only saved on dock, warp arrival and
  menu clicks, so "where you logged out" would not have held.
- New `tests/resume-spot.test.mjs` (13 tests): the reported bug, shield/boost persistence and clamping,
  docking clearing the spot, v14 fallback, eight kinds of damaged resume data, the no-thruster guard,
  export round-trip, live capture, and the resume point staying out of the portable profile.
- **Results:** `npm test` **260/260 pass** (both 8b oracles unchanged); `npm run build` succeeded.
  Docs, VISION decision log and folder READMEs updated; `TESTING-PLACES.md` section 4 rewritten.

---

## 2026-11-08: Step 10 complete and ticked — owner playtest passed

- The owner played `TESTING-PLACES.md`, found the three bugs listed in the entry below, and confirmed
  all three fixed ("Works"). **Step 10 is ticked** in `docs/ROADMAP.md`, `docs/REFACTOR_PLAN.md`,
  `docs/TARGET_ARCHITECTURE.md` and `docs/HANDOFF.md`.
- No code or save changes in this entry: save version stays **14**, `npm test` **247/247**,
  `npm run build` succeeded. Published as a GitHub release with `tallow-reach-step10.zip` attached
  (built HTML plus source, docs and the playtest guides) so it can be downloaded without building.
- Next: **step 11** — system map, pocket chooser and the 100+ system starmap (save v15). Ask VISION
  open questions 1 to 3 (travel rules, fog, difficulty) and what goes in Kestrel Hollow first.

---

## 2026-11-08: Step 10 playtest fixes — sound, start screen and loading a save

Three bugs the owner found playing step 10. All three were caused by step 10's resume-on-load work.

- **Load/Import/Reset did nothing visible (bug 3).** `afterSaveChange()` in `src/ui/menu.js` called
  `resetPlaces()` but the import was never added, so it threw a `ReferenceError` *after* `applySave`
  had already replaced the profile. The click handler aborted before its redraw, so the panel kept
  the old numbers; the next **Save** then wrote the already-loaded profile and redrew — exactly the
  owner's "load does nothing, then Save makes it appear" symptom. Fixed the import, split read/validate
  failure from post-load work in `ld`/`im` (a good code is no longer reported as invalid), and made
  both actions redraw. The click handler now only draws the panel when the pilot is docked, so
  loading an away save no longer leaves the station menu open over the flight HUD.
- **Docking showed the start screen (bug 2).** An away save hid the start panel but left
  `state.ui.intro = true`, so the next `render()` (on docking) drew the intro again. The start screen
  now owns the panel until it is dismissed: `docked`/`launched` handlers ignore events while
  `ui.intro` is set, and the button — renamed **"Enter the hangar" → "Enter game"** — clears the flag
  and calls `resumeFromSave()`, deploying the pilot where the save put them (docked at a station, or
  flying at that pocket's arrival point). Nothing simulates behind the start screen, and flight keys
  are inert until it is dismissed (`src/main.js`, `src/ui/hud.js`, `src/ui/screens.js`).
- **No sound after resuming out in space (bug 1).** `initAudio()` was only ever called by the start
  button, which an away save skipped, so the audio context never existed; the Esc sound switch had
  no master gain to change and could not fix it. `src/main.js` now starts/resumes audio on the first
  `pointerdown` or `keydown`; `initAudio()` also swallows a rejected `ctx.resume()`.
- New `tests/step10-fixes.test.mjs` (8 tests) drives the real `ui/menu.js` against a small DOM
  stand-in: load restores credits and redraws in the same click, an away slot resumes flying, import
  applies a good code and rejects a bad one without changing the game, reset works, docking never
  shows the start screen again, and sound starts on a gesture.
- **Results:** `npm test` **247/247 pass** (both 8b oracles unchanged); `npm run build` succeeded.
  Save version stays **14** — no save-shape change. `TESTING-PLACES.md` updated for the new button
  and start-screen flow. Six older entries moved verbatim to `docs/CHANGELOG_ARCHIVE.md`.



---

## 2026-11-08: Step 10 built — place definitions (systems and pockets), save v14

- Implemented the owner-approved systems/pockets model. `src/data/terms.js` holds the generic
  player-facing nouns (`mapNode: "system"`, `flyable: "pocket"`); `src/data/places.js` holds
  **Meridian System** and its pockets **Meridian Station** (`reach`, station + belt) and
  **Kestrel Hollow** (`hollow`, empty). Meridian is a station feature inside `reach`, not a child
  place. `PLACE_DEFS` carries the station, asteroid field, raider spawner and planet numbers that
  used to be hard-coded; `sim/places.js` is the generic loader and entities live in per-place
  containers (`state.places`, `placeWorld(id)`).
- Each pilot owns `place` and `warp`; `sim/step.js` runs shared systems once per occupied pocket.
  M cycles every pocket of the current system (a third data-only pocket is tested). One pilot
  warping does not move another pilot or clear a fight another active pilot is still having.
- Save **v14**: `world.place` replaces `world.sector`; v13 `sector` ids migrate where valid, older
  saves default to `reach`. Storage keys and `TR1:` codes unchanged. Loading a station save opens
  docked; loading an away save resumes flying at that pocket's arrival point with a launch-style
  refresh. Successful local warp arrival autosaves. In-game station label renamed
  **Meridian Outpost → Meridian Station**.
- Files: `src/data/{terms,places,sectors,shops,station}.js`, `src/sim/{places,world,asteroids,sectors,session,step,player,ai,enemy,combat,missile,effects,weapons,targeting}.js`, `src/state/{state,profile}.js`,
  `src/render/{scene,views,camera}.js`, `src/ui/{hud,screens,menu,warpflash}.js`, `src/main.js`,
  `src/index.html`, `src/util/events.js`; docs and folder READMEs aligned; new
  `tests/step10-places.test.mjs`, `tests/step10-save.test.mjs`, `tests/saves/v13-real.json`,
  `TESTING-PLACES.md` (rewritten as a numbered step-by-step) and `TEST-OLD-CODES.txt` (two real
  old-format `TR1:` codes — v12 flat and v13 split — so the old-save/old-code checks are playable
  without an old build; both verified to decode to v14 with the expected docked/flying resume).
- **Results:** `npm test` **239/239 pass** (both 8b single-player oracles unchanged);
  `npm run build` succeeded (`game/tallow-reach.html`, 623 KB). Slice checks: 10a 226/226,
  10b 226/226, 10c 239/239. **Owner playtest pending** (`TESTING-PLACES.md`). Next: step 11
  system map / pocket chooser.



---

## 2026-11-08: Fix high-refresh (240 Hz) ship blur via between-tick render interpolation

- **Root cause:** the pre-built `game/tallow-reach.html` in the merged 8c branch (`74a9ab5`) had
  never been rebuilt after step 7b, so opening it directly ran the old variable-`dt` loop at 240 Hz.
  Rebuilding `game/tallow-reach.html` in step 9 activated step 8a's 60 Hz `simClock`, where the
  ship mesh updated once every 4 frames (60 Hz) while `chaseView` eased the camera every frame
  (240 Hz), causing a ~2.4 px 60 Hz sawtooth jitter/blur on the ship model during side-to-side motion.
- **Fix:** `createSimClock` (`src/sim/step.js`) now exposes `alpha()` (`remainder / SIM_DT`) and
  optional `beforeStep`/`afterStep` hooks. `src/render/views.js` snapshots previous-tick poses in a
  `WeakMap` (keeping simulation records untouched) and interpolates entity meshes, the player hull,
  the mining beam origin, HUD markers (`src/ui/hud.js`) and `chaseView` (`src/render/camera.js`)
  across fractional frames, snapping immediately on teleports (`P.snap`). Also refreshed
  `renderer.setPixelRatio` on window resize (`src/main.js`).
- Added `tests/render-interp.test.mjs`; all **226 tests** pass (both 8b single-player oracles
  unchanged), and `game/tallow-reach.html` was rebuilt via `npm run build`. Save version remains **13**.
- **Owner playtest passed:** confirmed both the ship hull blur and the close-range locked-target
  name-tag blur (asteroids and raiders) are completely gone during combat and warping.



---

## 2026-11-08: Step 9 complete and ticked — Milestone B reached

- The owner reported the step 9 playtest passed. Ticked step 9 across `docs/ROADMAP.md`,
  `docs/REFACTOR_PLAN.md`, `docs/TARGET_ARCHITECTURE.md` and `docs/HANDOFF.md`; **Milestone B**
  (simulation-pure, fixed-step, player-aware, split-save core) is now complete.
- No gameplay or save changes in this entry (save version remains **13**, 225 tests green). Next is
  **Milestone C — step 10** (sector definitions and saving `world.sector`, save v14).



---

## 2026-11-08: Step 8 ticked; step 9 split saves (v13) and per-pilot rules — playtest pending

- Closed step 8 overall after the owner validated smooth 240 Hz play without tick interpolation
  (parking the two minor aim/respawn caveats in `docs/ROADMAP.md`), and aligned the local-only
  ownership table in `docs/TARGET_ARCHITECTURE.md` across steps 9, 10 and 16.
- Bumped `SAVE_VERSION` to **13** (`src/state/profile.js`, `src/state/storage.js`,
  `src/state/state.js`): saves split into `{ v: 13, profile, world }` (`state.profile` +
  `state.worldState`) with automatic migration from v1..v12 saves and `TR1:` codes, `sanitizeWorld`
  walking `BASE_MODULES` directly, and pure `portableProfile` / `mergeProfile` co-op helpers.
  Storage keys (`tr1`, `tr_s1`..`tr_s3`) and `TR1:` are unchanged.
- Closed all five step-9-owned local-only areas across `src/sim/{inventory,fitting,economy,contracts,session,player,weapons,combat,missile,ai,step}.js`
  and `src/ui/{hud,menu,screens}.js`: per-pilot holds, mining, crate pickup (even while local is
  docked), outfitting, purchases, missile persistence, contract progress/spawning, kill attribution,
  and per-pilot launch/dock without wiping another active pilot's fight.
- Added `tests/saves/v12-real.json`, `tests/step9-save.test.mjs` and `tests/step9-local-only.test.mjs`;
  all **225 tests** pass, and both 8b single-player oracle scripts match exactly. Rebuild required
  (`npm run build`); owner playtest pending (`TESTING-BASELINE.md` section M).



---

## 2026-11-08: Step 8c owner playtest passed

- The owner reports the 8c playtest works. Ticked 8c in the roadmap and refactor plan; no code
  or save data changed. Step 8 overall remains open pending frame-rate caveat validation.



---

## 2026-11-08: Step 8c scoped implementation complete — playtest pending

- Flight, drive, power, shield, hull, weapons, missiles and targeting use per-player runtime;
  shared world/projectile systems run once and enemies chase the nearest active player.
- Added two-player simulation, collision, targeting and weapon tests, plus a 12-second 8b
  single-player oracle and a second mining/combat/lifecycle oracle. All 216 tests pass; both 8b
  scripts match exactly. Build required;
  save version remains 12, no new dependency or multiplayer transport.
- Inventory, economy, docking, contracts, death/recovery and saves remain local-only as requested;
  the complete exceptions table is in `TARGET_ARCHITECTURE.md`, and step 9 must close every item.
  Owner playtest is pending (`TESTING-BASELINE.md` section L); full step 8 frame-rate caveats remain.



---

## 2026-11-08: Step 8c in progress — explicit flight, shields and damage

- `flight`, shield and power updates, and `hurt` accept a player or independently supplied
  runtime data. Non-local callers must supply their own resources. Hurt and death events name the
  affected player; local HUD/recovery ignore other players. Single-player defaults are unchanged.
- Added `tests/player-runtime.test.mjs` for independent motion, power, shields, profile damage and
  death routing. 206 tests pass; a 12-second single-player flight/weapon/warp probe matched the
  prior build. Save version remains 12.
- **8c remains incomplete:** the main loop, weapons, inventory, AI, lifecycle and other systems
  still assume one player. The owner does not want to playtest before 8c is complete.



---

## 2026-11-08: Step 8c started — player-specific transforms and launches

- `sim/pilot.js` transforms and mounts now accept an explicit player; projectile and missile
  launch can inherit that player's velocity. Existing callers default to the local player.
  Weapon and targeting calls pass their current player explicitly; gameplay and saves are unchanged.
- Added two-player transform and projectile launch tests (`tests/player-aim.test.mjs`); 202 tests
  pass. A scripted 12-second 8b-versus-current flight/weapon/warp probe was identical.
- **8c is incomplete**: simulation systems, power, damage, inventory, targeting, lifecycle and
  events still assume one player. No multiplayer sim is claimed. Frame-rate caveats remain.
  Save version stays 12; this work has not been playtested by the owner.



---

## 2026-11-08: Step 8b complete and ticked

- The owner reported the 8b playtest passed. Updated the handoff, roadmap and refactor plan;
  8c is next. No gameplay or save changes in this entry. The 8b build and 200 tests passed.



---

## 2026-11-08: Step 8a ticked; step 8b player records and controls

- The owner reported the 8a playtest passed, so 8a is ticked. The frame-rate caveats remain
  open; no separate 30/60/144 browser throttle result was reported.
- Added `state.players`, `localPlayer()`, `createPlayerRecord()` and independent per-player
  controls. Input and the screen follow the local player; `state.player` and `state.controls`
  temporarily alias that entry for existing systems until 8c. Guest gameplay is not implemented.
- Added `tests/players.test.mjs`: separate players, controls, input, replacement and local flight.
  200 tests pass. A scripted 12-second old-vs-new flight/weapon/warp probe was identical. Save
  remains version 12; 8b awaits playtest, and 8c is not started.

---

## 2026-11-08: Step 8 slices documented

- Expanded the approved 8a/8b/8c breakdown in `docs/REFACTOR_PLAN.md`, added separate status
  rows in `docs/ROADMAP.md`, and clarified the remaining work in `docs/HANDOFF.md`. 8a remains
  awaiting playtest; 8b and 8c have not started. No gameplay or save changes in this entry.

---

## 2026-11-08: Step 8a — fixed simulation tick (playtest pending)

- Added `src/sim/step.js` and `src/data/simulation.js`: gameplay runs at 60 ticks per second,
  while rendering remains per frame. The previous 0.05-second frame cap and pause semantics
  remain. HUD hints persist across display-only frames; cosmetic visuals and audio no longer
  consume the seeded gameplay random stream.
- `tests/sim-step.test.mjs` checks the real flight and seeded combat at 30/60/144 display rates,
  fixed-clock stalls, hints and the old loop. At 60 fps flight matches exactly; a 10-second test
  differs by 2.2932 units from old 30 fps and 1.3400 units from old 144 fps. 195 tests pass.
- Full game frame-rate independence is **not proved**: missile aim follows the rendered camera,
  asteroid respawn uses wall time, and rendering has no tick interpolation. Browser playtest is
  pending. 8b and 8c remain; save version stays 12. See `TESTING-BASELINE.md` section J.

---

## 2026-11-08: Step 7d complete and ticked

- The owner reported the registry cleanup playtest passed. Marked 7d complete in the handoff,
  roadmap and refactor plan; step 8 is next. No code or save changes in this entry.

---

## 2026-11-08: Step 7d — entity view registry cleanup

- Replaced view-kind switches and the separate enemy map with a registry and one active-view map.
  Each kind supplies its world list and build, update and removal handlers; enemy and other entity
  ids are namespaced because they use separate counters. Existing events and frame sweeps remain.
- Added fake-kind lifecycle, overlapping-id and particle cleanup tests; updated recipe 19 and the
  render README, and added `TESTING-BASELINE.md` section I. No gameplay or save changes; save version remains 12. 188 tests pass. Owner
  playtest pending; build and testing checklist are noted in the handoff and roadmap.

---

## 2026-11-08: Step 7c and step 7 complete and ticked

- The owner playtested step 7c and reported it passed. Marked step 7c and step 7 complete in
  `docs/ROADMAP.md`, `docs/REFACTOR_PLAN.md` and `docs/HANDOFF.md`; step 8 is next.
- No gameplay or save changes in this entry. The 7c build and all 185 tests passed previously.

---

## 2026-11-08: Refactor step 7c — hull view and render-free simulation

- Added `PlayerShipView` and shared named gun, missile and beam mounts in `src/data/mounts.js`;
  the sim transforms the same offsets without reading a mesh. Existing offsets are unchanged.
- Sector entry emits `sector-entered`, including docking resets; `main.js` updates scenery. The
  frame loop supplies the previous camera direction for missile lock. The sim imports no render
  files; the layer allow-list is empty. Save version remains 12.
- Added `tests/step7c.test.mjs` and a manual checklist in `TESTING-BASELINE.md` section H.
  `npm install`, `npm test` (185 passing) and `npm run build` succeeded. Owner playtest pending.
  Updated architecture, roadmap, handoff, and folder READMEs; generated HTML is not included.

---

## 2026-11-08: Step 7b complete and closed (docs only, no code change)

- **Why:** the owner asked for the slice to be ticked and closed, and raised nothing about it, so it
  is closed the way every other step has been. Nothing is in flight; **7c has not been started**.
  (The evidence it is right: the old-vs-new probe's 0 differences, 182 green tests, and
  `TESTING-BASELINE.md` section G, which is the manual check if anyone wants to re-run it.)
- **Also:** the commit was tagged **`step7b`**, so the owner can download the whole project as a zip
  straight from GitHub without any tool of mine being involved:
  `https://github.com/voltvehiclez/Tallow-Reach/archive/refs/tags/step7b.zip` (GitHub builds it on
  request; it contains the prebuilt `game/tallow-reach.html` and excludes `node_modules`). GitHub
  uploads are blocked from this sandbox's network, which is why a release asset could not be
  attached; the tag archive needs no upload. Step 7a was tagged `step7a-ticked` the same way.
- Files: `docs/ROADMAP.md` (status line, step-7 row, status log), `docs/HANDOFF.md` (next action),
  this changelog. No source changed, so no rebuild is needed for this entry — the zip and the build
  are the 7b build.

---

## 2026-11-08: Refactor step 7b — bullets, missiles, crates and particles become data

- **Why:** after 7a a hostile was plain data, but a bullet, a missile, a loot crate and an explosion
  spark were still three.js meshes living in `state.world`, moved and removed by the sim
  (`combat.js`, `effects.js`, `weapons.js`, `world.js`). The sim could not run without a scene, and a
  host could not send a guest a bullet. Step 7b removes that for every one of them.
- **Everything transient is a record now** (`src/sim/entity.js`, `src/util/ids.js`): a bullet is
  `{ id, kind: "bullet", pos, quat, v, own, dmg, l }`, a crate `{ id, kind: "crate", pos, quat, t,
  item, spin }`, a spark `{ id, kind: "fx", pos, v, l, t, col, size }` and a missile
  `{ id, kind: "missile", pos, quat, d, sp, t, l, dmg }` (`src/sim/missile.js` is new). `pos` and
  `quat` are three.js maths types, which the target architecture allows: **no `src/sim/` file holds
  a mesh, a material or the scene any more**.
- **`render/views.js` draws all of them.** It listens for the new `entity-spawned` / `entity-removed`
  events, builds one mesh per entity from its kind, copies `pos`/`quat` (and a rock's `scale`, a
  spark's fade) once a frame, and sweeps the lists so a mesh can never be left behind. The player's
  ship model lives here too, built from `profile.ship` and hidden while `player.docked`.
- **The player's ship is data.** `state.player.pos` / `quat` replace `state.player.m.position` /
  `.quaternion`; `src/sim/pilot.js` is the only way the sim reads them (`playerPos`, `playerFwd`,
  `playerLocal`, `facePlayer`). The turn is applied to the record in the same Y-then-X-then-Z order
  the model's `rotateY/X/Z` used.
- **Rocks are data a step early** (they were 7c) because the rules already read them: a rock carries
  `pos`, `quat`, `s0` (born size), `scale` (drawn size, which mining shrinks) and `shape` (which
  lumpy model), and `render/views.js` draws it into the sector group it belongs to.
- **The mining beam is a line of numbers:** the sim reports `state.flight.beamStart` / `beamEnd`
  while it cuts, and the view stretches a cylinder between them.
- **Two new sim files:** `src/sim/entity.js` (`addEntity` / `dropEntity` / `clearEntities`, and the
  only emitter of `entity-spawned` / `entity-removed`) and `src/sim/pilot.js`. `src/util/ids.js`
  hands out ids from a counter, so adding an entity never touches the seeded RNG.
- **Unchanged behaviour, proven.** An old-vs-new probe ran one seeded session through the previous
  commit and this tree (real three.js maths, a fake scene) and fingerprinted the pilot, power,
  every hostile, bullet, missile, crate, spark, rock, the lock and the hold after each stage:
  **flight, turning, boost, firing, hits, missiles, damage, lock-on, mining, loot, pickup and
  clearing all identical**. The only deliberate difference: a bolt's muzzle is now built from the
  ship's data instead of its `matrixWorld`, which three.js keeps a frame behind — so bolts no longer
  leave from where the guns were last frame (the documented stale-transform bug). With the probe
  refreshing `matrixWorld` first, both trees agree to the last digit.
- **Two bugs found and fixed while porting** (both would have changed play): mining must shrink the
  rock's *data* (`scale`), because collision reads it, not just its mesh; and a rock's random shape
  must be rolled *before* its position, in the same order as before, or a seed builds a different
  field. Both are now pinned by the probe and by tests.
- **`tests/layers.test.mjs`:** `asteroids.js`, `combat.js`, `effects.js`, `player.js` and `world.js`
  left the `render/` allow-list. Two files remain and the test now says why: `sectors.js`
  (`showSector` — scenery groups, step 10) and `weapons.js` (`camera.quaternion` for the lock cone,
  step 8). New rules: no sim file's *code* may mention `Mesh`/`Group`/`Geometry`/`Material`/
  `scene`/`matrixWorld`; a rock and the pilot's ship must be plain data; and `render/views.js` must
  know every entity kind.
- **New tests (182 in all):** `tests/headless-fight.test.mjs` (9) — the whole fight with no browser:
  a shot's record, a hit, a kill with loot crates, a crate picked up or expiring, a homing missile,
  mining a rock, clearing the world, and a check that the sim makes **no scene call at all**.
  `tests/views.test.mjs` grew five: a bullet's mesh appears and goes, crates/sparks/rocks are drawn,
  a missile is drawn from its record, the ship's model follows its record, and the beam's numbers.
- **Save:** unchanged, version stays **12**. **Files:** `src/sim/{entity,pilot,missile}.js` (new),
  `src/util/{ids}.js` (new), `src/sim/{combat,effects,weapons,player,asteroids,world,ai,targeting,sectors,session}.js`,
  `src/render/{views,camera,models}.js`, `src/ui/hud.js`, `src/main.js`, `src/state/state.js`,
  `src/util/{events,math}.js`, `tests/{headless-fight,views,layers,headless-sim}.test.mjs`,
  `src/sim/README.md`, `src/render/README.md`, `docs/{ARCHITECTURE,TARGET_ARCHITECTURE,ROADMAP,REFACTOR_PLAN,HOW_TO_ADD,HANDOFF}.md`,
  `TESTING-BASELINE.md` (new section G), this changelog and `CHANGELOG_ARCHIVE.md` (four oldest
  entries moved out, index lines added). Run `npm run build` and `npm test`.
- **`serve.mjs` (new, testing only):** `node serve.mjs` serves `game/tallow-reach.html` over HTTP
  with caching off, so the owner can play the current build in a browser without copying files.
  Nothing in `src/` imports it; the game is still built to one file by `npm run build`.
- **Next:** step 7c (the player hull's own view class and mount points), then step 8.

---

## 2026-11-08: Step 7a ticked (docs only, no code change)

- **Why:** the owner played the 7a build and reported that the raiders behave as usual and that
  they are cleared when the field is cleared on docking. That was the one thing the slice waited
  for, so 7a closes.
- **Also settled:** clearing raiders on docking is **not** a 7a change and not a bug. `dock()` has
  always called `clearTransient()` (pirates, bullets and missiles go; crates stay), and it does not
  count as a kill. Whether that should change is a gameplay decision, still open and not started.
- **State of the code, unchanged by this entry:** an enemy is a plain-data record
  (`src/sim/enemy.js`), `render/views.js` draws it, and no `src/sim/` file touches an enemy's mesh.
  165 tests green. Save version stays **12** (step 7 changes no saved data).
- **Files:** `docs/ROADMAP.md` (7a ticked, current position and log), `docs/HANDOFF.md` (next action
  is 7b), `docs/REFACTOR_PLAN.md` (slice 7a marked ticked), this changelog. No source changed, so no
  rebuild is needed: the zip and the tag are the 7a build.
- **Next:** step 7b, bullets, missiles, crates and particles as data with views.

---

## 2026-11-08: Refactor step 7a — a hostile becomes data; the mesh becomes a view

- **Why:** an enemy *was* a three.js mesh (`sim/ai.js` built one with `mkShip`, and every system that
  touched a hostile moved `e.m.position`). That is what stops the sim running on a host or in a test:
  the rules could not run without a scene. Step 7 removes that for every entity; 7a does hostiles.
- **A hostile is a record now** (`src/sim/enemy.js`):
  `{ id, kind: "enemy", def, n, f, loot, hp, mx, pos, quat, v, fire, o }`. `pos` and `quat` are
  three.js `Vector3`/`Quaternion` — maths types, which the target architecture allows — and no
  `sim/` file holds a mesh. `enemyPos`/`enemyFwd`/`turnEnemy`/`enemyDist`/`enemyVel` are the only
  ways to read its position and rotation, so the storage can change again in one file.
- **`render/views.js` draws them.** It listens for `enemy-spawned` and builds the mesh from the def
  (`mkShip(col, scale, true)`), copies `pos`/`quat` onto it once a frame, and removes it on
  `enemy-removed` — which fires when a hostile is killed, drifts out of `lostRange`, or the field is
  cleared by docking or a warp. A per-frame sweep reconciles the two lists so a mesh can never be
  left behind or missing.
- **Two files left the `render/` allow-list** in `tests/layers.test.mjs`: `ai.js` and `targeting.js`.
  `combat.js` and `world.js` still import render/ for crates and the spark field (7b/7c).
- **The station's position moved to the sim.** `STATION_POS` used to be exported from
  `render/scene.js`; targeting needs it (lock the outpost) and may not import render/, so it is in
  `sim/world.js` now and `ui/hud.js` reads it from there. It is still 0,0,0 — the outpost's mesh has
  not moved.
- **New tests (165 in all):** `tests/headless-sim.test.mjs` — the headless test step 7 asks for: one
  raider, 600 ticks, no browser, checking it approached, turned to face the pilot and fired; plus
  the kill, out-of-range and clear-the-field paths. `tests/views.test.mjs` — a mesh appears per
  hostile from its def's colour and size, follows its data every frame, and goes away with it. Two
  new layer tests: no `sim/` file may mention an enemy's mesh (`e.m`), and `render/views.js` is the
  only place that builds one. `tests/headless.mjs` gained `opts.keep`, so a test can load one
  `render/` file for real (that is how `views.js` is tested).
- **Equivalence proof:** an old-vs-new probe ran one scripted fight (spawn, chase, shoot, kill, drop
  loot, out-of-range removal, dock) through the previous commit and this tree, fingerprinting the
  player and every hostile each tick: **2545 of 2545 frames identical**. The one new thing is each
  enemy's `id`, which is what the view keys its mesh on.
- **Save:** unchanged, version stays **12**. **Files:** `src/sim/enemy.js` (new),
  `src/render/views.js` (new), `src/sim/{ai,combat,targeting,weapons,world}.js`, `src/util/math.js`
  (`fwdQ`/`faceQ`), `src/util/events.js` (two events), `src/render/scene.js` (STATION_POS moved out),
  `src/ui/hud.js`, `src/main.js`, `tests/{headless,layers,enemies,content}.test.mjs`,
  `tests/headless-sim.test.mjs` (new), `tests/views.test.mjs` (new), `src/sim/README.md`,
  `src/render/README.md`, `docs/{ARCHITECTURE,TARGET_ARCHITECTURE,HOW_TO_ADD,ROADMAP,HANDOFF}.md`,
  this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-08: Step 6 ticked in full (docs only, no code change)

- **Why:** the owner played the 6b build and reported **no problems with the controls**. That was
  the one thing 6b was waiting for, so step 6 closes.
- **What was signed off:** `TESTING-BASELINE.md` section A (flight feel) and section B (mining,
  guns, missiles). The lock ring resizing with the window was checked by the owner too.
- **State of the code, unchanged by this entry:** no `src/sim/` file imports `core/` (no sound, no
  keys, no mouse), the sim reads `state.controls`, and the lock ring is sized in `ui/hud.js`. 155
  tests green. Save version stays **12** (step 6 changed no saved data).
- **Files:** `docs/ROADMAP.md` (step 6 ticked, current position and log), `docs/HANDOFF.md` (next
  action is step 7; the layers-test row no longer says "input (until 6b)"), this changelog. No
  source changed, so no rebuild is required: the zip and the tag are the 6b build.
- **Next:** step 7, entities as data and meshes as views, in three playable slices.

---

## 2026-11-08: Refactor step 6b — the sim stops reading the keyboard (step 6 done)

- **Why:** with 6a the sim no longer played sound; it still read the keyboard and the mouse
  directly (`keys.KeyW`, `pointer.x` in `sim/player.js`, `sim/weapons.js` and `sim/sectors.js`), and
  `sim/weapons.js` even measured the missile lock ring in **screen pixels**. That is the thing that
  makes a second player impossible: a guest's controls arrive from the network, not from a keyboard.
- **New `state.controls`** (`src/state/controls.js`): one plain record per pilot —
  `steer {x,y}`, `roll`, `thrust`, `strafe`, `lift`, `stop`, `brake`, `boost`, `fire`, `sec`.
  `core/input.js` owns the key table (`HELD`) and rebuilds the record after every key or mouse
  change; the sim reads it and never sees a key code. **No `src/sim/` file imports `core/` any
  more**, which is what "step 6 done" means. The shape is the co-op contract: step 8 puts it on a
  per-player record, step 16 fills a guest's copy.
- **The missile lock ring moved to the screen.** The sim now reports the cone in **degrees**
  (`state.flight.coneAngle`), and `coneRadiusPx()` in `ui/hud.js` turns that into pixels with the
  camera's field of view and the window height. Checked against the old formula at 0, 1, 10, 20, 30
  and 45 degrees: identical to the last digit (20 deg on a 60-degree camera at 900 px is
  283.68672218631417 px, before and after). The sim no longer reads `innerHeight`.
- **Two small cleanups in passing**, both verified to change nothing: the stored
  `state.flight.gunsOn` flag is gone (it was only ever read inside `sim/weapons.js`, where it is now
  a local; a stale copy on a shared record would mislead co-op), and losing window focus now clears
  held keys as well as releasing the free camera, so a ship cannot keep thrusting while the player
  is in another window.
- **New tests (`tests/layers.test.mjs` is 14 now):** no `sim/` file may import `core/` at all, none
  may mention `keys`/`pointer`, `HELD` may only set fields the record has, the record's exact field
  list is pinned, each record owns its own `steer` object, and the ring's pixel maths is checked.
  `tests/content.test.mjs` gained the new source strings for the two guards it already had.
- **Proof it plays identically.** A probe drove one scripted session through the previous commit
  (setting `keys`/`pointer`) and this tree (setting `state.controls`), with real three.js maths and a
  per-frame fingerprint of position, rotation, velocity, throttle, boost tank, Shield HP, Hull HP,
  power draw, gun cooldowns, beam state, entity counts and warp state: **1010 of 1010 frames
  identical.** The session covered throttle, steer, roll, strafe, lift, brake, stop, boost ignition,
  six volleys, 6 seconds of mining, secondary fire and a warp with the stick easing out.
- **No save change** (`SAVE_VERSION` stays 12) and no gameplay, balance or UI change.
- **Tests:** 155 pass (was 150).
- Files: `src/state/controls.js` (new), `src/state/state.js`, `src/core/input.js`,
  `src/sim/player.js`, `src/sim/weapons.js`, `src/sim/sectors.js`, `src/ui/hud.js`,
  `src/ui/pause.js`, `src/main.js`, `tests/layers.test.mjs`, `tests/content.test.mjs`,
  `src/core/README.md`, `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md`
  (the debt row now names only `render/`), `docs/HOW_TO_ADD.md` (recipe 8 rewritten: one-off keys
  vs held controls), `docs/ROADMAP.md` (6a ticked, 6b logged), `TESTING-BASELINE.md`, this changelog.
  Run `npm run build` and `npm test`.

---

## 2026-11-08: Refactor step 6a — the sim stops playing sounds itself

- **Why:** the biggest structural debt in `docs/TARGET_ARCHITECTURE.md` is `src/sim/` importing the
  screen, the speakers and the keyboard. Step 6 splits it in two, and this is the sound half (6a).
  Eleven places in `src/sim/` called the synthesiser directly (`tone()`, `nz()`, `oreGained()`,
  `warpCharge()`, `warpBurst()`), so no test could run the sim without a browser, and a co-op host
  could never decide which machine should hear a boom.
- **New event `sfx { name, ...rest }`.** The sim now says *what happened*; `core/audio.js` decides
  what that sounds like. `src/sim/{weapons,player,combat,ai,effects,sectors}.js` no longer import
  `core/audio.js` at all. Extra fields carry the moment's own numbers:
  `{ name: "explosion", count }` (still only rumbling above 10 particles) and
  `{ name: "warp-charge", dur }` (the warp's own charge length).
- **`SFX` table in `src/core/audio.js`** holds one entry per sound, and these eleven names are what
  the sim emits: `cannon`, `ore-gained`, `missile-lock`, `missile-fire`, `boost`, `hit`, `pickup`,
  `enemy-fire`, `explosion`, `warp-charge`, `warp-burst`. One listener, `on("sfx", playSfx)`, plays
  them. **Every waveform, frequency, duration and volume is copied unchanged** — this is a wiring
  change, not a sound change.
- **Deliberately not hung on existing gameplay events.** It would be tidier to play the ore chime
  from the `mined` event and the pickup pip from `pickup`, but the sim intends the chime to fire
  **once per ore the beam secures**, while the `mined` event fires once per ore that actually lands
  in the hold (`weapons.js`: `emit("sfx", { name: "ore-gained" })` sits above the `while` loop that
  emits `mined`). They are not the same moment, and a design that assumed they were would have
  quietly coupled a sound to a cargo rule. *(Correction, same day: an earlier draft of this entry
  justified the choice with "mining with a full hold chimes but emits no `mined`". The owner pointed
  out that the beam never cuts when the hold is full — `updatePrimary` says "Cargo hold full" and
  returns before the cutting branch — so that case does not arise. The separation is still right;
  the example was wrong.)* Each `sfx` sits at the exact old call site, so the sounds are 1:1 with
  before.
- **New `tests/layers.test.mjs` (9 tests):** imports are parsed statement by statement, so a
  side-effect import cannot swallow the next one. It fails if any `src/sim/` file imports
  `core/audio.js`, `core/input.js` (that line is deleted in 6b) or `ui/`, holds a shrinking
  allow-list of `sim/` files that may still import `render/` (step 7 empties it) and checks the
  allow-lists only name files that really do that import. It also checks both directions between
  the names the sim emits and `SFX`, and that playing a sound with no audio context never throws.
  All three deliberate breakages (re-importing audio, a typo'd name, a stale allow-list entry)
  were caught.
- **Proof it plays identically.** A probe bundled the previous commit and this tree, ran one
  scripted session through both with a recording Web Audio context (a fake `window.AudioContext`
  logging every node, envelope, start/stop and the delayed `setTimeout` chimes), and compared the
  result: **671 log lines identical**, the same 55 oscillators, 19 noise bursts and 11 delayed
  pips, covering all eleven sounds.
- **No save change** (`SAVE_VERSION` stays 12) and no gameplay, balance or UI change.
- **Tests:** 150 pass (was 141).
- Files: `src/util/events.js`, `src/core/audio.js`, `src/sim/weapons.js`, `src/sim/player.js`,
  `src/sim/combat.js`, `src/sim/ai.js`, `src/sim/effects.js`, `src/sim/sectors.js`,
  `tests/layers.test.mjs` (new), `TESTING-BASELINE.md` (a by-ear table), `src/core/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (the debt row now
  names only 6b/7), `docs/HOW_TO_ADD.md` (recipes 9 and 10 rewritten), `docs/ROADMAP.md` (steps 4
  and 5 ticked after the owner's playtest; step 6a logged), this changelog.
  Run `npm run build` and `npm test`.

---

## 2026-11-07: Recorded what is and is not per-shop about shops (docs only)

- **Why:** the owner asked whether the game can hold more than one **independent** shop (for
  example a trader in Kestrel Hollow beside Meridian's). A probe answered it, and the answer is worth
  keeping so the next session does not re-derive or, worse, pre-empt it.
- **What holds up:** shops are independent as content — `SHOPS` entries with their own heading,
  rows, prices and `max` limits, addressed by `shopId`, with limited stock keyed per shop
  (`"shopId:itemId"`), so two shops never share a shelf.
- **What does not (yet):** the *destination*. Every purchase lands in the one place `STATION`
  (`profile.store`) and room is checked there, so a shop in another sector would deliver into — and
  be blocked by — Meridian's storage. The probe showed exactly that: independent prices and stock,
  both purchases in one `profile.store`, and a full station refusing the other shop's sale.
- **Owner's decision, recorded:** other stations will have **their own independent inventory**. The
  route is written into the new known gap in `docs/ARCHITECTURE.md`: named places in
  `sim/inventory.js`, their stock saved with the world (step 9), and the sector naming its station and
  shop (`OUTPOST_SHOP` becomes a sector field, step 10).
- **No code, no save change.** `SAVE_VERSION` stays 12; tests unaffected (141 still pass).
- Files: `docs/ARCHITECTURE.md` (known gap), this changelog.

---

## 2026-11-07: Spare modules can be sold (60% of the shop price)

- **Why:** the game treated a module as unsellable. `canSell(id)` is `itemValue(id) > 0` and a
  module's catalogue entry was only `{ cat: "module" }`, so every selling path skipped parts: the
  Inventory's right-click **Sell** was greyed out on a MOD tile ("Modules cannot be sold; only
  cargo has a sell value"), and the Base tab's **Sell hold / Sell stored** quietly sold only ore and
  salvage. A part you took off a hull was dead weight.
- **The owner's rule:** a spare module sells for **60% of its shop price**, never below 1 credit —
  the beam **540** (of 900), the missile pod **900** (of 1500), the six standard parts **1** each
  (60% of 1 would round to nothing, and then they could not be sold again). The values are data, in
  `ITEMS[<module>].v` in `src/data/items.js`, and a test fails if a shop price and its sell value
  stop agreeing (`Math.max(1, Math.floor(price * 0.6))`).
- **Changed:** `sim/economy.js` — `sellHold()` and `sellStored()` count and sell goods **and** spare
  parts, and return a message (`Sold 4 items for 1270 cr.`, or `Nothing in the hold can be sold.`);
  `sellInventoryItem()` no longer says "Only cargo can be sold."  `ui/menu.js` — right-click **Sell**
  is offered whenever the item has a value, the box is titled with the item's name
  (`SELL BASIC MINING BEAM`) instead of "Sell cargo", and the two Base buttons now report their
  result in the toast. `ui/screens.js` — the Base tab's sell buttons look at everything with a value
  (and say so), and the Inventory blurb mentions selling.
- **What is still not for sale:** a module **fitted in a bay** — it is in no stock, so no selling
  path can reach it, and a test pins that. Missiles loaded in a launcher are not cargo either.
- **No save change.** Sell values come from the catalogue, not the save; `SAVE_VERSION` stays 12.
- **Tests:** 141 pass (was 132). New `tests/selling.test.mjs` (9 tests): every sellable item is worth
  whole credits, a part sells at 60% of its shop price from a hold or the station, refusals change
  nothing, the refinery bonus applies to parts, whole-hold and whole-station sales take the parts,
  the "nothing to sell" messages, a fitted part is never sold, and source guards on the old
  "cargo only" rules. `tests/content.test.mjs` gained the price↔value rule.
- Files: `src/data/items.js`, `src/sim/economy.js`, `src/ui/screens.js`, `src/ui/menu.js`,
  `tests/selling.test.mjs` (new), `tests/content.test.mjs`, `TESTING-SELLING.md` (new),
  `src/data/README.md`, `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`,
  `docs/HOW_TO_ADD.md` (recipes 2 and 16), this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-07: Shop fix — the cannons are listed once, as "Basic cannons"

- **Why:** the Shop showed the cannons twice. The first line, **Autocannons — Primary. Standard
  issue. — Owned**, was typed into the old shop screen and came through step 5 as a `kit` list of
  "standard-issue" lines; step 5's own change then put **Basic cannons** in the stock at 1 cr. The
  game has only one cannon module (`cannon_basic`, "Basic cannons"), so one of the two lines was
  wrong — and "Autocannons" named a part that does not exist.
- **Changed:** `src/data/shops.js` loses its `kit` list, and `shopHtml()` in `src/ui/screens.js`
  no longer draws one. A stock row is now the **only** way a part appears on the shop screen, so
  the same part cannot be listed twice. The Shop's first two rows (the beam and the missiles) are
  unchanged, word for word.
- **Nothing else changes:** the same eight parts are for sale at the same prices (beam 900 cr,
  missile pod 1500 cr, the six standard parts 1 cr each), and buying, selling, saves and flight are
  untouched. Save version stays 12.
- **When more cannon types exist** they are new `MODULES` entries plus a shop row each (recipe 17):
  one row per cannon, no extra list.
- **Tests:** 131 pass. `tests/shops.test.mjs` now fails if a shop has a `kit` list or if any item
  appears in a shop's stock twice.
- Files: `src/data/shops.js`, `src/ui/screens.js`, `tests/shops.test.mjs`, `TESTING-SHOPS.md`,
  `src/data/README.md`, `docs/ARCHITECTURE.md`, `docs/HOW_TO_ADD.md` (recipe 4), `docs/ROADMAP.md`,
  this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-07: Refactor step 5 — shops and prices from data (plus a visible Shop change)

- **Why:** the Shop was hard-wired. `SHOP_WEAPONS` in `data/weapons.js` held two rows, `buyWeapon()`
  in `sim/economy.js` knew those two keys by name, and `shopHtml()` even had a third row
  ("Autocannons — Owned") typed into the markup. A second trader, or a station selling a spare
  powerplant, needed code in three files.
- **New:** `src/data/shops.js` — `SHOPS`: per shop, a heading (`n`), its line of explanation (`d`),
  `kit` (standard-issue parts, shown as "Owned", not sold) and `stock` (one row per item: `id`,
  `price`, how the row is worded `n`/`d`, and optionally `max`). Meridian is the first entry and
  sells what it sold before. One generic `buyItem(shopId, itemId, qty = 1)` in `sim/economy.js`
  replaces `buyWeapon`, plus `shopList(shopId)` (what the Shop tab draws) and `shopStock()`/
  `setShopStock()` (see stock below).
- **Visible change the owner asked for:** six rows added at **1 cr** each — `power_basic`,
  `cell_basic`, `thruster_basic`, `shield_basic`, `cannon_basic`, `hull_basic` — so a pilot who takes
  a standard part off a hull, or loses one with a ship, can always buy it back. The beam stays 900 cr
  and the missile pod 1500 cr. Those six rows are marked `own: false`, so they do not show
  "You own N" (that count includes the stock fit of hulls you have not bought).
- **Stock rules:** no `max` means the shop never runs out — every Meridian row today. A row with
  `max: 5` shows "N left", greys out at zero, and `buyItem()` refuses when it is gone. How much is
  left lives in **session state** (`state.shops`), never in the save, and starts again from `max`.
  `setShopStock(shopId, itemId, n)` is the one hook a restock timer, a restock event or a random roll
  will call later; nothing calls it today. Restocking is deliberately unfinished, not forgotten.
- **The 8 starter missiles moved to the item:** `missile_basic` has `ammo: 8` in `data/modules.js`
  (the save's clamp was already reading `MODULES.missile_basic.cap`), so a purchase tops the rack up
  to 8 and never takes missiles away. `SHOP_WEAPONS` is deleted.
- **Changed:** `sim/economy.js` (the generic purchase; a module is still bought into the station's
  inventory through `sim/inventory.js`, whose `buyItem` gained a quantity argument),
  `ui/screens.js` (`shopHtml()` draws from `shopList()`/`shopDef()`), `ui/menu.js` (the Buy button
  passes `shopId:itemId`), `state/state.js` (`shops: {}`), `data/weapons.js` (now only `MISSILE`).
- **Nothing else plays differently.** An old-vs-new probe ran the same 19-step session through the
  previous commit and this one (buy beam and missiles, move one to a hold, fit a beam in an empty
  bay, unequip a powerplant, store the hold, load, sell the hold, sell the station, repair, buy a
  ship, upgrade the base, restock missiles): **credits, every stock, every hold, every loadout, the
  base levels and every message were identical**, and the Contracts, Hangar, Outfitting, Inventory,
  Base and Saves tabs render byte-identical HTML. On the Shop tab the two old rows are unchanged,
  word for word and in the same order, with the Launch button still last; the only differences are
  the six new rows and the invisible `data-b` now naming shop and item.
- **Save version unchanged (12).** Nothing saved changed.
- **Tests:** 131 pass (was 121). New `tests/shops.test.mjs` (10 tests): every row is complete and
  names a real item, Meridian's prices and its "Autocannons" line, the beam/missile messages and
  missile top-up, refusals that change nothing, the six 1-credit parts and quantity purchases, what
  `shopList()` hands the screen, a temporary limited shop that sells out and is restocked through
  `setShopStock()`, stock never reaching the save, and source guards proving the tabs read `SHOPS`.
  The old `SHOP_WEAPONS` assertions moved out of `content.test.mjs` into it.
- Files: `src/data/shops.js` (new), `src/data/weapons.js`, `src/data/modules.js`, `src/sim/economy.js`,
  `src/sim/inventory.js`, `src/state/state.js`, `src/ui/screens.js`, `src/ui/menu.js`,
  `tests/shops.test.mjs` (new), `tests/content.test.mjs`, `tests/inventory.test.mjs`,
  `TESTING-SHOPS.md` (new), this changelog and the docs listed in the step. Run `npm run build` and
  `npm test`.

---

## 2026-11-07: Refactor step 4 — the item catalogue and one inventory per place (save v12)

- **Why:** the game knew five cargo types by name. `data/items.js` built a fixed object with a key
  per ore (`emptyCargo()`), the save named those keys by hand, spare modules were a separate list,
  and every system that touched cargo looped over the same `KEYS` array. A sixth item — a trade
  good, a second salvage type, ammo — meant editing the sim, the save and the screens.
- **New:** one catalogue, `ITEMS` in `src/data/items.js`, with a category (`ore`, `salvage`,
  `module`, `ammo`, `consumable`, `trade`), a sell value, a volume in m³ and a stack rule. Every
  module is an item entry too (`beam_basic: { cat: "module" }`) whose name, volume and stats stay in
  `data/modules.js`, so nothing is written twice. Code reads it through the helpers only
  (`itemName`, `itemVol`, `itemValue`, `canSell`, `itemStack`, `isModule`, `isItem`).
- **Save version 12.** A place (`profile.store`, `profile.holds[id]`) is one stock,
  `{ itemId: count }`, instead of goods in one object plus a `modules` list — and `profile.modules`
  is gone. Old saves convert on load: the old lists are poured in, zero counts are dropped, unknown
  ids and negative counts are still cleaned. `tests/saves/v11-real.json` is a genuine v11 save
  (written by the code before this step) and a test converts it.
- **Changed:** `sim/inventory.js` (`moveItem` replaces `moveCargo` and `moveModule`; new `addItem`,
  `takeItem`, `countOf`, `itemsAt`, `unitsOf`, `buyItem`, and `valueOf`, which moved here so it can
  be tested without the screen), `sim/fitting.js` (bays are fitted from the one stock),
  `sim/economy.js` (store, load and sell read the catalogue; selling or storing now touches only
  goods, so spare parts are never swept away), `sim/combat.js` and `sim/weapons.js` (a picked-up
  crate or a mined ore is `addItem(...)`), `ui/screens.js` and `ui/menu.js` (one tile list per place,
  the same ORE/MOD tiles, arrows and Sell box).
- **Nothing plays differently.** A throwaway probe ran the same 29-step session through the previous
  commit and this one, with the screen and the speakers stubbed: buying 3 beams and 2 missiles, a
  refused purchase, 11 cannons into a hold that only takes 10, ore across, fitting a beam, a bad bay,
  unequipping a powerplant, buying and switching ships, storing, loading, selling the hold, selling
  the station, selling part of a stack, and what the station is worth. **Credits, every stock, the
  m³ in use and every fitted bay were identical after every step**; the Inventory, Shop and Base tabs
  also render byte-identical HTML (10,332 characters). One wording change: buying an id that does
  not exist says "Unknown item." instead of "Unknown module." — no screen can reach it.
- **Tests:** 121 pass (was 118). `tests/inventory.test.mjs` now covers the v11 conversion, the
  registry (a test adds a temporary item and watches it be carried, moved, listed and sold), and a
  source guard: no file may read `profile.cargo`/`profile.modules` or import a fixed list of item
  keys again.

---

## 2026-11-07: Refactor step 3 — loot tables (drops and ore mix are data)

- **Why:** the two drop rules were written inside the game code — one or two salvage crates and a
  10% core in `sim/combat.js`, the ore mix in `sim/asteroids.js` — so a new drop, a second enemy's
  loot or a new rock type meant editing the sim. Now both are tables.
- **New:** `src/data/loot.js` (`LOOT_TABLES`, two kinds: `drops` — a line per drop with a chance `w`,
  a count range `c` and a scatter `j`; and `pick` — one weighted choice, for a rock's ore) and
  `src/sim/loot.js` (`rollLoot(id, rng)`, `pickLoot(id, rng)`, pure and tested). The raider table is
  today's rule exactly: `salv` 1–2 at 100%, `core` 1 at 10% dropped on the wreck; the asteroid table
  is ferrite 62 / cobalt 30 / voidite 8.
- **Changed:** `src/data/enemies.js` gains `loot: "raider"`; the enemy record carries it
  (`src/sim/ai.js`), `killHostile` rolls the table instead of hard-coding crates, `spawnAsteroid`
  takes its ore from the table, and a crate in the world now carries **which item it holds**
  (`{ m, t, item }`) instead of a `core` flag — `src/sim/targeting.js` reads that for its label, so
  the marker still says "crate" / "reactor core".
- **Nothing plays differently.** Checked against `main` before this step, both versions running on
  the same substituted `Math.random`: **50,000 rocks gave an identical ore sequence**, and 200,000
  kills each gave the same odds — one crate 49.80% vs 49.96%, two crates 50.20% vs 50.04%, a core
  10.02% vs 9.85%, and in both versions every core landed exactly on the wreck. One honest detail:
  the 50/50 crate count now maps a low die to *one* crate where the old code mapped it to *two*, so
  individual kills can swap 1↔2 crates while the odds are unchanged. Matching that would have meant
  writing the count range backwards in the data, which is worse than the invisible difference.
- **New:** `tests/loot.test.mjs` (9 tests, rolls each table 10,000 times and checks the odds,
  determinism, a 0% line never dropping, an unknown table giving nothing, and that adding a drop is
  a data edit) and `TESTING-LOOT.md`. `tests/content.test.mjs` now checks every loot table: real item
  ids, sane weights and ranges, every enemy's table exists, and the raider/asteroid numbers pinned.
- **Also:** `tests/rng.test.mjs` followed the crate change (`c.core` → `c.item`).
- **Saves:** none; still version 11, no migration.
- **Tests:** 118 pass (108 before).
- Files: `src/data/loot.js`, `src/sim/loot.js`, `src/data/enemies.js`, `src/sim/ai.js`,
  `src/sim/combat.js`, `src/sim/asteroids.js`, `src/sim/targeting.js`, `tests/loot.test.mjs`,
  `tests/content.test.mjs`, `tests/rng.test.mjs`, `TESTING-LOOT.md`, `src/data/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (closed debt removed),
  `docs/HOW_TO_ADD.md` (recipe 18 added), `docs/HANDOFF.md`, `docs/ROADMAP.md`, this changelog.
  Run `npm run build` and `npm test`.

---

## 2026-11-07: Refactor step 2 — seeded randomness everywhere

- **Why:** "same seed, same run" is the foundation for generated sectors, wormhole instances and
  co-op. Six rolls in the simulation still called `Math.random()` directly, so seeding never covered
  the whole game.
- **Changed:** `src/util/rng.js` now owns everything: `makeRng(seed)` is a new independent generator
  (same seed, same sequence, forever), `setSeed(n)` installs it for the whole game, `setSeed(null)`
  goes back to `Math.random`, and `random()` reads `Math.random` at call time when unseeded.
- **Changed:** the six direct rolls now go through `random()` — the raider's circling direction and
  the two wander-spawn dice (`src/sim/ai.js`), the 1-or-2 crates and the 10% core (`src/sim/combat.js`),
  and a rock's ore type (`src/sim/asteroids.js`). Same number of rolls, same order, same odds.
- **New:** `tests/rng.test.mjs` — fails and names the file and line if `Math.random` appears anywhere
  in `src/sim/` or `src/data/`; checks `makeRng` repeatability, range and independence from the shared
  stream; and runs the real spawn, loot and asteroid code headlessly to prove `setSeed(1)` twice gives
  the identical run.
- **Nothing plays differently.** The old code (commit `75498f8`) and the new code were run side by side
  with a substituted `Math.random`: 70 asteroid rocks (ore type, size, ore amount), 60 simulated
  seconds of raiders with the hunt spawner and every bullet, and 40 kills of loot rolls all came out
  identical.
- **Rule for next time:** never call `Math.random()` in `src/sim/` or `src/data/` — use `random()`, or
  `makeRng(seed)` when a thing must regenerate from its own seed. Written into `ARCHITECTURE.md`,
  `src/sim/README.md` and `src/util/README.md`.
- **Saves:** no change; still version 11, no migration.
- **Tests:** 108 pass (101 before).
- Files: `src/util/rng.js`, `src/sim/ai.js`, `src/sim/combat.js`, `src/sim/asteroids.js`,
  `tests/rng.test.mjs`, `src/util/README.md`, `src/sim/README.md`, `docs/ARCHITECTURE.md`,
  `docs/TARGET_ARCHITECTURE.md` (closed debt removed), `docs/HOW_TO_ADD.md` (recipe 12 rewritten),
  `docs/HANDOFF.md`, `docs/ROADMAP.md`, this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-07: Refactor step 1 — enemies are data (enemy registry, `enemy-killed` event)

- **Why:** the Newbie Raider's numbers were written inside `sim/ai.js`, so a second enemy meant
  editing game code. Now an enemy is one entry in `src/data/enemies.js`, which is the first piece of
  Milestone A (content becomes data-only additions).
- **New:** `src/data/enemies.js` (`ENEMIES`, the `raider` entry with exactly today's numbers: name,
  plural name, 10 Hull HP, colour, scale, faction, `chase` behaviour, close/near/orbit speeds,
  circling distance, fire/lost/hear ranges, first-shot delay, shot gap, 1 damage, 520 m/s bolt, spawn
  distance; plus `DEFAULT_ENEMY` and `enemyDef()`), `src/data/factions.js` (`FACTIONS`: `pirates`),
  `tests/headless.mjs` (runs `src/sim/` code in a test with the screen and sound stubbed out — no new
  package, it uses the esbuild the build already needs), `tests/enemies.test.mjs`, `TESTING-ENEMIES.md`.
- **Changed:** `src/sim/ai.js` — `spawnPirate(p)` is now `spawnEnemy(id, pos)`; the model, record
  (`def`, `n`, `f`, `hp`, `mx`, fire timer) and the shot all read the def, and the behaviour comes
  from `AI_BEHAVIOURS` (one entry, `chase`). `src/sim/combat.js` emits
  `enemy-killed { def, faction }`; `src/util/events.js` lists it; `src/sim/contracts.js` counts only
  the enemy a hunt contract names; `src/data/contracts.js` stores that id (`e`) and builds the wording
  from the def's plural name, so it still reads "Destroy 3 pirate raiders".
- **Nothing plays differently.** The same numbers were copied, not retuned, and the old and new
  `sim/ai.js` were run side by side for 60 simulated seconds in three situations (a lone raider, the
  wandering spawner, a hunt contract): enemy positions, Hull HP, fire timers and every bullet's
  position and damage matched step for step. Hunt contracts still count raiders only. Contract text,
  rewards, the lock marker ("Newbie Raider 100%") and loot are unchanged.
- **Saves:** no change; save version still 11, no migration. A hunt contract saved by an older
  version has no enemy id, so it keeps its old wording and still counts any hostile.
- **Tests:** 101 pass (94 before; two `content.test.mjs` source-guards were replaced by real
  enemy-table checks, and six headless enemy tests are new).
- **Roadmap:** steps 0 and 1 ticked 2026-11-07 (the owner played this build; old save with a
  Prospector loaded unchanged).
- Files: `src/data/enemies.js`, `src/data/factions.js`, `src/sim/ai.js`, `src/sim/combat.js`,
  `src/sim/contracts.js`, `src/data/contracts.js`, `src/util/events.js`, `tests/headless.mjs`,
  `tests/enemies.test.mjs`, `tests/content.test.mjs`, `TESTING-ENEMIES.md`, `src/data/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (two closed debts
  removed), `docs/HOW_TO_ADD.md` (recipe 6 rewritten), `docs/HANDOFF.md`, this changelog.
  Run `npm run build` and `npm test`.

## 2026-11-07: Vision, target architecture, roadmap and refactor plan (docs only, no code change)

- **Why:** the owner's plan is much bigger than the code's shape (100+ sector starmap, wormhole
  instances, a story campaign, host-run co-op) and several different AI assistants will work on it.
  The docs now say what the game is, where it is heading, in what order, and how to get there safely.
- **New:** `docs/VISION.md` (scope, design pillars, open design questions with defaults),
  `docs/TARGET_ARCHITECTURE.md` (eight principles, data model, save split, multiplayer model, a
  "Debt today" table with evidence), `docs/ROADMAP.md` (status of every step, content to add and when),
  `docs/REFACTOR_PLAN.md` (15 behaviour-preserving steps in 4 milestones, each with goal, work, "done
  when", save version and how the owner runs it), `TESTING-BASELINE.md` (a 10-minute whole-game
  click-through), root `AGENTS.md` and `CLAUDE.md` (pointers for tools that read them).
- **Changed:** `docs/HANDOFF.md` (big picture, reading order, "keep the structure" now means keep
  folders and conventions, restructure only through numbered steps), `docs/ARCHITECTURE.md` (reading
  order, the `sim/` imports `render/`+`core/` exception stated honestly), `docs/AI_PROMPTS.md`
  (model-agnostic starter prompt, refactor-step prompt, content prompt, using several AIs),
  `docs/HOW_TO_ADD.md` (note on which recipes change), `README.md` (links).
- **Housekeeping:** this file had 24 full entries (the limit is 15). The 15 oldest were moved
  word for word to `CHANGELOG_ARCHIVE.md` and indexed below; 10 plus this one remain.
- No source, data, test or save change; save version still 11. No rebuild needed.

## 2026-11-07: Inventory Sell quantity uses a game-styled popover

- Replaced the browser-owned quantity prompt with a small in-game box positioned beside the
  selected inventory tile. It contains the quantity field (prefilled with the stack size),
  inline validation, and Sell/Cancel buttons. No other inventory layout changed.
- Files: `src/ui/menu.js`, `src/styles.css`, `tests/inventory.test.mjs`, this changelog.
  Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory Sell asks how many units to sell

- Choosing Sell on a cargo stack now opens a quantity prompt, prefilled with the whole stack
  count. Enter any whole number from 1 to the stack size to sell that partial or full amount;
  cancelling leaves the stack unchanged. Existing prices and refinery bonus still apply.
- Files: `src/ui/menu.js`, `src/ui/screens.js`, `src/sim/economy.js`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory grids use five narrower, shorter slots per row

- Set both inventory grids to exactly five columns, with narrower tiles and a 68px tile/row
  height. The 25-slot minimum gives five rows by default; each additional item beyond 25
  naturally adds a row. The three-row scroll viewport and independent scrolling are retained.
- Files: `src/styles.css`, `tests/inventory.test.mjs`, this changelog. Save data unchanged.
  Run `npm run build` and `npm test`.

## 2026-11-07: Inventory grids keep their size when empty, and moves no longer show status text

- Each hold now always renders a 5-by-5 slot field with a fixed three-row viewport, so empty
  slots preserve the inventory window size and scrolling can be tested even with fewer items.
  Station and ship grids scroll independently. Moving items clears/suppresses the "Moved ..."
  status message; other actions are unchanged.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Station and ship item grids scroll independently after three rows

- Both inventory grids now show up to three full rows at once and scroll within their own
  window when they contain more. This keeps the station and selected ship hold independently
  browsable without changing the surrounding Inventory layout or other screens.
- Files: `src/styles.css`, `src/ui/README.md`, `tests/inventory.test.mjs`, this changelog.
  Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Right-click inventory menu can sell a cargo stack

- Right-click an inventory tile to open an extensible context menu. Its first action is Sell,
  which sells that cargo type's whole stack from the station or selected ship hold using the
  existing item prices and refinery bonus. Modules show Sell disabled because they have no
  existing resale value. No inventory/save format changes.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/sim/economy.js`,
  `src/ui/README.md`, `tests/inventory.test.mjs`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory tile text restored to the more readable size

- Raised item names from 11px to 12px and volume labels from 9px to 10px, restoring their
  previous readable sizes while keeping the more compact tile layout.
- Files: `src/styles.css`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory item tiles tightened to reduce empty space

- Reduced each tile's minimum height, padding, typography and spacing, and fit more columns
  across the panel. No inventory behavior or data changed.
- Files: `src/styles.css`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory tiles move one item on click and a stack on Shift-click

- Removed the two small move buttons from every tile. Clicking a tile moves one item;
  Shift-clicking it moves the whole stack. Tiles are slightly shorter to fit more items.
  The inventory data and capacity rules are unchanged.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

---

## 2026-11-07: Inventory contents displayed as a compact grid

- Replaced the long per-item row list in both the station and ship inventories with compact,
  responsive item tiles showing category, quantity, volume and the existing move-one/move-all
  controls. Inventory data and movement actions are unchanged.
- Files: `src/ui/screens.js`, `src/styles.css`, `src/ui/README.md`, `tests/inventory.test.mjs`,
  this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Lateral, vertical and reverse thrust increased to 60%

- Doubled `FLIGHT.strafe`, `FLIGHT.lift` and `FLIGHT.reverse` from 0.3 to 0.6. Forward
  thrust and turn are unchanged. No save data change.
- Files: `src/data/ships.js`, `tests/content.test.mjs`, this changelog. Rebuild and test.

## 2026-11-07: Boost works from any throttle and press snaps throttle to full forward

- Boost no longer requires positive throttle; when active it adds forward acceleration only,
  so it never boosts the ship backward even if throttle is in reverse.
- A fresh Shift press sets throttle to +100% once. Holding boost does not lock the throttle,
  so the pilot can change it while boosting. Existing throttle-to-speed behavior is otherwise
  unchanged. Save version unchanged; no migration needed.
- Files: `src/sim/player.js`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-06: HANDOFF.md rewritten to match the project as it is now (docs only)

- **Why:** the header and a few lines were out of date. It said the built file in the zip predated the
  inventory work (the zip has no built game; the user builds it themselves), gave a workspace path and a
  GitHub address nobody could confirm, and told the assistant to deliver a zip and open the built game
  with `present_file`.
- **Now it says:** save version 11 and 94 tests (counted from `tests/`), that the user builds on their own
  computer, that the inventory has not yet been checked in the real game, how to deliver (complete files,
  full paths, non-coder test steps), the archive rule for the changelog, that this file is rewritten and
  not appended to, and that big features (the planned storyline and missions) are planned first and built
  in small playable slices. The module table, the knobs table, the module pattern and the known gaps were
  checked against `data/modules.js`, `data/ships.js`, `data/sectors.js`, `data/weapons.js` and
  `data/station.js` and are unchanged.
- No code, data or save change. Save version unchanged (11). No rebuild needed.
- Files: `docs/HANDOFF.md`, this changelog.

## 2026-11-06: Docs scale: old changelog entries move to an archive (docs only)

- **`docs/CHANGELOG.md` now keeps only the newest entries in full** (10 at the time of this change). Older
  entries were moved, word for word, into the new `docs/CHANGELOG_ARCHIVE.md`, so nothing was lost.
- **An "Older entries" index at the bottom of the changelog lists every archived entry in one line**
  (date and title), so a new session still knows everything that has been done without reading
  it all. Open the archive only when the index shows something relevant to the task.
- **A written rule for the future:** when the changelog holds more than 15 full entries, move the
  oldest ones to the archive until 10 remain, and add one index line for each one moved
  (see the top of this file and "Keeping the docs scalable" in `ARCHITECTURE.md`).
- Reading order, the checklist in `HOW_TO_ADD.md`, the starter prompt in `AI_PROMPTS.md`, `HANDOFF.md`
  and the READMEs now mention the archive and the index.
- No code, data or save change. Save version unchanged (11). No rebuild needed.
- Files: `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md` (new), `docs/ARCHITECTURE.md`,
  `docs/HOW_TO_ADD.md`, `docs/AI_PROMPTS.md`, `docs/HANDOFF.md`, `README.md`.


## 2026-11-06: Inventory — the station and every ship have room in m³, and you can buy more than one module

- **Why you could only buy one module:** the Shop hid the Buy button as soon as `ownsModule()` was
  true, so a second beam or launcher could never be bought. The shop now always offers Buy (and says
  `You own N`); the only limit is room.
- **New Inventory tab** (between Outfitting and Shop): the **station** on top (ore and modules, with
  `used / room m³`), then the hold of one ship below it, with arrows to step through every ship in the
  hangar (the arrows only change which hold you are looking at, not which ship you fly). Each row
  has `1` and `all` buttons that move that item between the station and the ship shown, limited by
  room at the destination.
- **Everything is in m³.** Ore is 1 m³ a unit (`ITEM_VOL`), each module has a `vol`
  (powerplant 3, cell 3, thrusters 4, shields 3, cannons 2, beam 2, hull 4, missiles 2 — tuning
  in `data/modules.js`). The station holds `250 x Storage bay level` m³; a hold is the hull's size
  (Wasp 20, Bulwark 30, Prospector 70). Ore and modules share the room. Fitted modules take none.
- **Purchases go to the station** (`buyModule`), as many as you like while there is room; a full
  station refuses the sale and charges nothing. **Outfitting fits from the station's modules**: the
  picker shows one square per kind with a count (`Basic cannons x3`). Taking a part off a ship (or
  swapping one) needs room in the station and says so if there is none.
- **Each ship now has its own hold** (`profile.holds[shipId] = { cargo, modules }`). Cargo stays in the
  ship it is in: switching ships no longer carries it along, so the old "Store your cargo first"
  refusal is gone. Mining and crate pickup fill the flown ship's hold, and the HUD `Hold x/y m³`
  now counts carried modules too. A destroyed ship takes its hold with it. The Base screen's
  Store hold / Load stored / Sell hold act on the ship being flown and only on ore.
- **Save version 11.** Saves from before 11 hand their single `cargo` to the ship they were
  flying; other ships start with an empty hold; the station's ore and modules are unchanged.
  Importing and loading old codes works (tests cover it).
- Behaviour you may notice: the missiles that come with the launcher (8) are only given when you
  carry fewer than 8; a second launcher does not top you up.
- New `sim/inventory.js` (pure, no 3D). Files: `data/items.js`, `data/modules.js`, `state/profile.js`,
  `state/state.js` (`ui.invShip`), `sim/inventory.js`, `sim/economy.js`, `sim/fitting.js`,
  `sim/session.js`, `sim/combat.js`, `sim/weapons.js`, `ui/screens.js`, `ui/menu.js`, `styles.css`,
  docs, READMEs, tests (new `tests/inventory.test.mjs`; the prototype-save test now expects the
  hold). **94 tests**, run against a stand-in for three.js because it could not be installed
  there — run `npm test` yourself. `npm run build` needed (not built in that session).


## 2026-11-06: Handoff note brought up to date (docs only)

- `docs/HANDOFF.md` was out of date: its header said save version 7, 64 tests and 581 KB while
  the body said version 10, and it left out the hull module, the missile launcher, the Services
  box and the ship switcher. The outer `HANDOFF.md` also still said 22 tests, 559 KB and that
  `ships.js` holds the Wasp's speed. Rewritten to match the code: save version 10, 81 tests
  (counted from `tests/`), a 587 KB build, all eight modules, current known gaps.
- No code, data or save change. No rebuild needed.
- Files: `docs/HANDOFF.md`, this changelog.


## 2026-11-06: Repairs and missile restock moved into Outfitting

- **The Hangar's "Hull repairs" list is gone.** Repairing now happens in
  Outfitting, in a **Services** box below the 3D viewer: one row, acting on the
  ship currently shown in the viewer — `Hull HP N%`, an `Intact`/`Repair N cr`
  button (same cost curve, same behaviour, same toast).
- **The Shop's "Missile stock" row is gone.** The **Missile restock** row sits
  in the same Services box: `N of cap loaded`, restocks up to the capacity of
  the launcher fitted to the ship in the viewer for 35 cr per missile. Hidden
  when no launcher is fitted.
- The Services box re-reads the selected ship on every render, so switching
  ships with the arrows updates the repair cost and the restock row.
- Save version unchanged (10). Tests: **81 passing** (1 new guard).
  `npm run build` needed.
- Files: `ui/screens.js`, `styles.css`, docs (ARCHITECTURE, TESTING-OUTFITTING), tests.


## 2026-11-06: Ship switcher above the 3D viewer; the berth count is gone

- **Outfitting shows a switcher above the 3D viewer** (left/right arrows with
  the ship's name and `N of M in the hangar` in the middle). It cycles through
  the ships you own, wrap-around, the same selection the Hangar's Fly button
  makes — cargo is respected, so a ship that cannot hold what you carry is
  refused with the same message the Fly button shows. With one ship the arrows
  are disabled. The viewer re-fits the new hull on the next frame.
- **The Hangar's `Berths 2/3` line is removed**; the buy limit that fed it
  still applies and is still enforced on the Buy buttons.
- Tests: **80 passing** (1 new guard). Save version unchanged (10).
  `npm run build` needed.
- Files: `ui/screens.js`, `ui/menu.js`, `styles.css`, docs, tests.


## 2026-11-06: Whole numbers in the top-left readouts; labels recoloured to match their bars

- **The Shield HP / Hull HP / Boost numbers are whole numbers now**
  (`${Math.round(...)}`), matching the bars' coarse granularity.
- **Each top-left label takes its bar's colour** — Shield HP in `--ice`,
  Hull HP in `--ink`, Boost in `--amber` — so the three blocks are
  distinguishable at a glance.
- Save version unchanged (10). `npm run build` needed.
- Files: `index.html`, `styles.css`, `ui/hud.js`.


## 2026-11-06: Numbers on the shield and hull bars — and the units are "Shield HP" / "Hull HP" everywhere

- **The shield and hull bars in the HUD show numbers like boost does**: bottom-left labels
  now read `Shield HP 7.2 / 10` and `Hull HP 10.0 / 10` style — each on one line with its
  reading beside it (the same flex-label treatment as the boost bar; both bars were plain
  labels before). A ship with no shield/hull module reads `none`, like boost with no tank.
- **"Shield HP" and "Hull HP" are the unit names everywhere**: the HUD labels, the bay stat
  lines in Outfitting (`10 Shield HP` / `10 Hull HP`), the shop and Hangar rows, the repairs
  screen, the module data and descriptions, and the user docs (TESTING-OUTFITTING, ARCHITECTURE,
  HOW_TO_ADD, HANDOFF, READMEs). Historical CHANGELOG entries are left as they were written.
- Tests: **79 passing** (1 new guard). Save version unchanged (10). `npm run build` needed.
- Files: `index.html`, `ui/hud.js`, `ui/screens.js`, `data/modules.js`, `data/outfitting.js`,
  `data/ships.js`, `sim/*.js` (comments), `state/*.js` (comments), docs, tests.


## 2026-11-06: Asteroid collision damage scaled to the 10-point hull

- Hull points are 10 now (the hull is a module), so a collision that used to take a tenth of
  the old 100-point bar was effectively removing the ship outright. Asteroid collisions
  (`speed * 0.15`, threshold 25 m/s, same as always) now deal `speed * 0.015` — the same
  proportion of the hull as before, 1/10th the damage. The speed threshold is unchanged.
- Files: `sim/player.js`. Save version unchanged (10). Tests: **78 passing**. `npm run build`
  needed.


## 2026-11-06: The hull is a module — "Basic hull", 10 hit points, no module fitted means none

- **New hull module: `hull_basic` ("Basic hull")**, 10 hit points, standard issue in every
  hull bay (the bay existed but could hold nothing). Hit points work exactly like shield
  points — the fitted module decides how many the ship has (`sim/hull.js`, read from
  `MODULES[id].hp`), and **no hull module fitted means no hit points at all**: `P.hull` is 0
  and the first hit that reaches the hull emits `player-dead` — a one-shot kill, exactly the
  "fly without shields" rule. Shields, if fitted, still absorb their hits first.
- **Hit points no longer come from `SHIPS[].hull`** — the stat is gone from the data, from
  repairs (`economy.repairCost` now reads the fitted module's `hp`), from the Hangar row
  (`Hull 10` is the fitted amount) and from the tests; a hull with no module shows `Hull 0`.
- **Damage is never forgotten and never given for free.** The hull fraction lives in
  `profile.hp[ship]`, stamped on every hull hit in `hurt()` and on dock, so a fit change, a
  hangar visit or a ship switch keeps the damage taken — unfitting the hull at the outpost
  drops the ship to 0 points, and fitting it back restores the fraction (never a free repair;
  topping it up stays the paid Hangar repair). `refreshHull()` is called wherever
  `refreshShield()` is.
- **Save version 10.** Saves from before 10 get `hull_basic` fitted into their hull bays
  (like the thrusters, shields and cannons before it — the bay was unfillable); a v10 save
  where the player emptied the bay stays hull-less. Existing ships effectively go from
  100 HP to 10 HP, and saved `hp` fractions carry over, so a damaged ship is equally damaged.
- **Outfitting** shows `10 hull` under the bay name like other modules; `hit points` are not
  affected by the flat power bill, and `FLIGHT` is untouched.
- Files: `data/modules.js` (`hull_basic`, `STOCK_FIT.hull`), `data/ships.js` (stat removed),
  `sim/hull.js` (new), `sim/player.js` (`setShip`, placeholder, `hurt()` stamps the fraction),
  `sim/session.js`, `sim/economy.js`, `sim/fitting.js`, `ui/hud.js` (bar guard), `ui/screens.js`
  (stat line + Hangar row), `main.js`, `ui/menu.js`, `state/profile.js` (v10), tests
  (**78 passing**, 3 new), READMEs, docs. `npm run build` needed.


## 2026-11-06: The missile launcher is a module — "Basic missiles", 8 damage, 12 cap, 4 s reload — and the beam shows its rate

- **The shop missile launcher is gone; Basic missiles (`missile_basic`) is a module now**,
  in the `secondary` group, bought for the same 1500 cr (the row reads *Owned* once bought,
  and buying still includes 8 missiles). Fit it in the Secondary weapons bay like any other
  module. It works exactly like the old launcher — right click, the dashed lock cone, MISSILE
  LOCK, homing, 7 s life — with three changes: **8 damage per missile** (was 80), a
  **12-missile capacity** (unchanged) and **4 seconds between launches** (was 0.9 s). The
  stock is still refilled at the Shop (35 cr per missile), and the restock row now appears
  when a launcher is fitted, capped by it.
- The missile's flight and lock-on mechanics moved conceptually into the launcher module;
  what stays in `data/weapons.js` is the missile itself plus the ammunition price
  (`MISSILE`) and the Shop rows (`SHOP_WEAPONS`). `sim/guns.js` gained `missilesOf()` and
  `refreshGuns()` now also sets `state.missiles`; a fired missile carries its module's damage,
  so a mid-flight fit change cannot alter what is already in the air.
- **Save version 9.** Saves from before 9 whose owner had bought the launcher get one
  `missile_basic` in storage instead (not auto-fitted; their carried missiles stay, clamped
  to 12). The whole `profile.wp` object left the save — ownership of both formerly flagged
  weapons is now the module's presence.
- **The Outfitting bay shows the beam's mining rate**: **0.25 m³/s** under `Basic mining beam`
  (one ore = 1 m³, one ore per 4 s of contact), the same stat line other modules get. The
  missiles bay shows `8 dmg, 12 cap, 4 s reload`.
- Files: `data/modules.js` (`missile_basic`), `data/weapons.js`, `state/profile.js` (v9),
  `sim/guns.js` (`missilesOf`), `state/state.js`, `sim/weapons.js`, `sim/economy.js`,
  `ui/screens.js` (stat lines, shop rows), `ui/hud.js`, READMEs, docs, tests (**75 passing**,
  3 new). `npm run build` needed.


## 2026-11-06: All hulls are the same ship apart from the hold — and the hold is measured in m³

- **Wasp, Prospector and Bulwark now have identical stats.** Hull 100, gun damage ×1, mining
  rate ×1 (the Prospector's ×2.3 is gone — no more ≈1.7 s ores), model scale 1 and price
  600 cr on every hull. The only remaining difference is the hold, which is why the hold was
  kept: **Wasp 20 m³, Bulwark 30 m³, Prospector 70 m³**. One cargo unit = 1 m³.
  Colours and the per-hull add-on meshes (the Prospector's drill, the Bulwark's plates) are
  kept, so the hulls remain visually distinct. Ship-specific bonuses arrive later; a test
  pins the everything-but-the-hold identity.
- **Holds are shown in m³**: the HUD readout (`Hold 12/20 m³`), the Hangar rows and the
  Cargo and storage panel. 1 unit of cargo occupies 1 m³, for every item type.
- Save version unchanged (8) — no saved-data shape changed. Repair costs drop for owners
  of the big hulls (hull 100 across the board); `hp` fractions persist, so damage carries
  over correctly.
- Files: `data/ships.js`, `ui/hud.js`, `ui/screens.js`, READMEs/docs, tests (**72 passing**,
  1 new). `npm run build` needed.

---


## 2026-11-06: The beam bar moves under the mining hint, only while cutting — and an ore-secured chime

- **The beam progress bar is smaller, moved, and shows only while mining.** It now sits
  directly under the amber "… left in rock" hint (top 62%) — the text that already tells you
  what the rock holds — is 150 px wide with a 4 px bar and 11 px labels, and is visible only
  while the beam is actually cutting (`state.flight.beamOn`). It was bottom centre above the
  power block and visible whenever the beam slot was selected with a beam fitted.
- **A satisfying chime when an ore banks.** `oreGained()` in `core/audio.js` — a warm
  ascending D5–A5–D6 — plays the moment a beam cycle completes (progress hits 100%), on top of
  the existing hold-capacity rules.
- Files: `src/index.html` (`#bm` after `#pr`), `styles.css` (`#bm`), `ui/hud.js` (visibility
  condition), `core/audio.js` (`oreGained`), `sim/weapons.js` (calls it), READMEs, docs.
- Save version unchanged (8). Tests: **71 passing**. `npm run build` needed.


## 2026-11-06: Beam progress resets the moment contact is lost; beam bar in the HUD; module names in the UI

- **The 2-second grace is gone.** The instant the beam stops cutting — ship off the rock,
  trigger released, mine out of reach, cargo full, or not enough power — the progress toward
  the next ore is lost straight away (`state.flight.beamT` → 0, one "Beam contact lost — the
  ore starts again" message). `state.flight.beamIdle` and the `BEAM_RESET` constant are gone,
  and a test guards the immediate reset. Dock/launch/fit/warp still clear the count.
- **New beam progress bar in the HUD.** Bottom centre, above the power readout: the fitted
  beam's name and the percentage on the right (`Basic mining beam … 37%`), filling toward the
  next ore. Shown only while the beam slot is selected and a beam is fitted.
- **The primary line and the equip toast take the modules' own names.** `moduleListName()` in
  `sim/guns.js` builds them — `Basic cannons` with one gun, `Basic cannons x2` with both bays
  (same module), `Basic mining beam` in the beam slot, `A + B` for a mixed pair — and the HUD
  and `setWeapon` share it, so they can never disagree. The hardcoded `Cannons` /
  `Mining beam` / `Cannons equipped` / `Mining beam equipped` strings are gone; the shop row
  for the beam now reads **Basic mining beam** (it buys exactly that module).
- Files: `ui/hud.js` (bar + primary line), `src/index.html` (`#bm`), `styles.css` (`#bm`
  block, mirrors `#pw`), `sim/guns.js` (`moduleListName`), `sim/weapons.js`, `state/state.js`,
  `sim/sectors.js`, `data/weapons.js`, READMEs, tests.
- Save version unchanged (8). Tests: **71 passing** (2 new). `npm run build` needed.


## 2026-11-06: The mining beam is a module — "Basic mining beam", one ore per 4 s of contact

- **Replaces the old mining beam outright.** Same Shop slot and price (900 cr), but buying it
  now drops a `beam_basic` module into storage (the row reads *Owned* once it is somewhere you
  own, fitted or in storage). The `wp.beam` flag is gone from the save.
- **Fits either primary bay**, like a gun — Outfitting, fit it in a bay. **Key 2** selects the
  beam slot; with no beam fitted the slot is the `Empty weapon slot` and left click does nothing.
- **One ore per 4 seconds of uninterrupted contact** with the rock (scaled by the hull's `mine`
  multiplier, so the Prospector cuts faster). The ore banks per completed 4-second cycle; the
  rock depletes one ore at a time and disappears when dry.
- **Two seconds off the rock and the count toward the next ore resets.** Contact is timed per
  frame (`state.flight.beamT` / `beamIdle`); taking off the target for more than 2 s discards
  the in-progress ore with the message "Beam contact lost — the ore starts again". A fit
  change, dock/launch, load or warp clears the count too.
- **2 MJ/s while cutting** — reported as `setDraw("beam", …)` with a new `state.power.use.beam`,
  gated by `hasPower()`, and drawn only while actually mining (not with the slot merely
  selected, not without a rock in reach) — the same rules the guns follow.
- **Save version 8.** Saves from before 8 whose `wp.beam` was set (players who had bought the
  beam) get one `beam_basic` in storage on load — **not auto-fitted**; fit it once and carry on.
  Re-importing an old code cannot double-grant. The `beam` flag is dropped from the save.
- Files: `data/modules.js` (`beam_basic`), `data/weapons.js` (beam leaves weapon data; the
  shop row gains a `module` field), `sim/guns.js` (`beamsOf`, refreshes `state.beams`),
  `sim/weapons.js` (beam rewrite), `sim/sectors.js` (warp clears the count),
  `sim/economy.js` (shop purchase → module storage), `sim/fitting.js` (`ownsModule`),
  `state/state.js` (`flight.beamT`/`beamIdle`, `beams`, `power.use.beam`), `ui/hud.js` (slot
  line), `ui/screens.js` (shop *Owned* check), `state/profile.js` (v8 + migration),
  plus docs and tests.
- Behaviour note: the beam and the guns can coexist in the two primary bays; key 1/2 decides
  which left click fires. If two beams are fitted, the first bay's beam is the one that cuts.
- Tests: **70 passing** (4 new). `npm run build` needed.
- Known limit: the beam has no dedicated progress bar; the mining hum tracks the rock's
  remaining ore as before, and an interrupted count is only visible via the reset message.


## 2026-11-06: "Empty weapon slot" now covers an empty cannon slot too

- **One wording for every empty primary slot.** With every primary bay empty, the top-right
  HUD line now reads `Empty weapon slot` (it said `No guns` before), and pressing 1 toasts
  `Empty weapon slot` instead of `Cannons equipped`. The slot behaves the same as the empty
  beam slot: left click does nothing, and the HUD and toast agree with each other.
- Unchanged: `Cannons` / `Cannons x2` with guns fitted, `Mining beam` with the beam bought,
  and left click firing only in a filled slot.
- Files: `src/ui/hud.js` (the primary line), `src/sim/weapons.js` (`setWeapon` toast),
  `tests/content.test.mjs` (guard: the old wording is gone), `TESTING-OUTFITTING.md`.
- Save version unchanged (7). Tests: 66 passing. `npm run build` needed.


## 2026-11-06: Keys 1 and 2 now cycle the primary slots; key 2 with no beam is the "Empty weapon slot"

- **Pressing 2 selects the beam slot even with no mining beam bought.** The centre-screen
  message says **"Empty weapon slot"** (instead of refusing the switch or naming a weapon
  you do not have), the top-right HUD line reads `Empty weapon slot`, and **left click does
  nothing** in that slot — the guns only answer in the cannon slot, the beam only with the
  beam bought. Key 1 switches back to the cannon slot at any time.
- **Cycling model**: 1 = cannon slot (whatever the primary bays are fitted with — already
  symmetric: with no guns fitted it shows `No guns` and left click does nothing), 2 = mining
  beam slot (`Mining beam` once bought, `Empty weapon slot` until then).
- **Buying the beam** flips the slot to the beam without any extra step; the selected slot is
  saved as before (`pw` stays "beam" in a save, same as always) — no save change (still v7).
- Files: `src/sim/weapons.js` (`setWeapon` cycles slots unconditionally), `src/ui/hud.js`
  (the primary line names the empty slot), `tests/content.test.mjs` (wording guard).
- Behaviour change from the two earlier today entries: pressing 2 with no beam is no longer
  silent — it equips the empty beam slot and switches the HUD line with it.
- Tests: 66 passing. `npm run build` needed.


## 2026-11-06: Pressing 2 with no mining beam fitted no longer shows a message

- **Switching to an unavailable primary weapon is now silent.** Pressing 2 with no mining
  beam bought simply does nothing and says nothing, instead of toasting "No mining beam
  installed. Buy one in the station shop." The `"Cannons equipped"` / `"Mining beam equipped"`
  confirmations and every other message are unchanged; the beam still cannot be equipped
  until it is bought.
- Files: `src/sim/weapons.js` (`setWeapon`).
- Save version unchanged (7). Tests: 65 passing. `npm run build` needed.


## 2026-11-06: Twin-linked bolts fire from the fixed nose hardpoints (one per side)

- **Follow-up to the twin-linked cannons below**: the two bolts no longer straddle the gun's
  bay mount (both came from the same side of the nose). A multi-barrel gun now fires from the
  **fixed nose hardpoints at -1.8 m and +1.8 m**, one bolt per side — the pre-module cannon
  layout. `BARREL_SPACING` in `sim/weapons.js` is now 3.6 m; single barrels still fire from
  their bay mount (`-1.8 + 3.6 * i`).
- Positions are the same whichever primary bay the gun sits in. Two twin-linked guns fitted at
  once (impossible today — one `cannon_basic` exists and nothing sells parts yet) would each
  fire their own pair from the same hardpoints.
- Rate, power draw, damage and the `barrels` stat are unchanged. No save change (still v7).
- Files: `sim/weapons.js` (hardpoint rule + comment), `docs/ARCHITECTURE.md`.
- Tests: 65 passing. `npm run build` needed.


## 2026-11-06: Basic cannons fire two bolts per shot again (twin-linked barrels)

- **`cannon_basic` links two barrels** (`barrels: 2` on the module): one trigger pull now puts
  **two bolts** downrange, side by side (0.9 m apart, `BARREL_SPACING` in `sim/weapons.js`),
  straddling the gun's own mount — the way the cannons fired before they became a module.
  One gun in the first primary bay is enough for the pair of bolts.
- **Same fire rate, per barrel**: 3 shots a second per barrel, on the gun's own `1 / rate`
  cooldown as before. **Same power draw**: 2 MJ/s a gun while the trigger is held, however
  many bolts come out (the `guns` share in `state.power.use` counts guns, not bolts).
- **Damage per bolt unchanged** at 1 (before the hull's `dmg` multiplier), so a pair is 2
  damage per shot per gun; a Newbie Raider (10 hull) drops in about two seconds of fire from
  the stock fit. No behaviour change when both primary bays are filled: each fitted gun fires
  its own linked pair (four bolts a volley).
- **Outfitting bay shows it**: the stat line for the cannon reads `1 dmg x2, 3/s`.
- Files: `data/modules.js` (`barrels` + `rate` noted per barrel), `sim/guns.js` (carries
  `barrels`, default 1), `sim/weapons.js` (one bolt per barrel, `BARREL_SPACING`),
  `ui/screens.js` (`moduleStat` shows x2), docs (`ARCHITECTURE.md`, `HOW_TO_ADD.md` recipe 16,
  folder READMEs) and tests updated.
- **Save version unchanged (7).** `barrels` is a module stat, not saved data.
- Tests: 65 passing (2 new guard assertions plus the fire-loop rule). `npm run build` needed.


## 2026-11-06: Basic cannons are a module you can fit in either primary bay; raiders are Newbie Raiders with 10 hull

- **Basic cannons are now a module** (`cannon_basic`, group `primary`): **1 damage a shot, 3
  shots a second, 2 MJ/s while the trigger is held**, 900 m/s bolts. Every hull is delivered with
  one in the first primary bay; the second bay starts empty. The same gun works in **either**
  bay — the bay only decides which barrel the shot leaves from — and both bays firing means two
  guns on their own 1/3-second cooldowns, 4 MJ/s while the trigger is down.
- **Left click still fires the primary.** Keys 1 and 2 still switch between cannons and the
  mining beam; the fitted guns are what actually shoot. An empty pair of primary bays means left
  click does nothing and costs nothing.
- **Guns draw power like everything else.** They report `setDraw("guns", …)`, so the power
  readout climbs by 2 MJ/s a gun while firing and drops back when you let go; with no power left
  they stop firing rather than draining a dead cell.
- **The flight HUD's primary line counts the guns.** Top right it reads `Cannons`, `Cannons x2`
  when both bays are filled, or `No guns` when they are empty (and `Mining beam` after key 2).
- **Pirate raiders are now "Newbie Raiders"** and have **10 hull points, no shields** — three
  seconds of cannon fire from the stock Wasp. The target lock and the HUD read the name instead
  of "hostile NN%", so a lock now says `Locked Newbie Raider 100%`. The 70 + 25-per-tier hit
  points are gone: every raider is the same 10-point hull now.
- **Files:** `data/modules.js` (`cannon_basic`, `STOCK_FIT.primary`), `data/weapons.js`
  (`PRIMARY.cannon` removed — guns are modules), `sim/guns.js` (**new**: `gunsOf`, `refreshGuns`),
  `sim/weapons.js` (per-gun cooldowns and barrels, the 2 MJ/s draw, `hasPower` gate),
  `state/state.js` (`state.guns`, `flight.gunCd`, `flight.gunsOn`, `power.use.guns`),
  `sim/{fitting,session,economy,power}.js` and `ui/menu.js` refresh the guns wherever the drive
  and shields are refreshed, `sim/ai.js` (`RAIDER` constant), `sim/targeting.js` (`lockName`),
  `ui/screens.js` (`moduleStat` shows `1 dmg, 3/s`), `ui/hud.js` (the primary line counts the
  guns).
- **Save version 7.** Older saves gain a basic cannon in their first primary bay (empty bays
  stay empty if the save is already v7).
- Tests: 64 passing (4 new: the cannon figures, either-bay gunnery, the version-7 migration, the
  Newbie Raider). `npm run build` needed (581 KB).
- Verified headless: 3 bolts a second and 1 damage each, 2 MJ/s a gun (4 with two guns), guns
  stop at 5.0 s on a 10 MJ cell with one gun and 2.5 s with two, no power means no shots, no gun
  means no draw, and `spawnPirate` makes a 10 HP "Newbie Raider" with no shield pool.


## 2026-11-06: The boost tank has numbers: 10 units, 2 a second out, 1 a second back

- **The boost bar is now a fuel tank measured in units.** Basic thrusters hold **10 units**,
  burn **2 a second** while boosting (about five seconds from full to the reserve) and refill at
  **1 a second** when you let go. Mechanically nothing changed: the ignition still costs a flat
  20 MJ, filling the tank is still free, and the boost still doubles the drive.
- **The numbers are on the module** (`bmax: 10`, `buse: 2`, `bfill: 1` on `thruster_basic`), so a
  future thruster can carry a bigger tank or a thirstier boost without touching code — the same
  pattern as speed, turn and the power draw.
- **The HUD shows it.** The Boost line, top left, now reads like `Boost 8.4 / 10` beside the bar,
  so you can see the exact fuel as well as roughly how full it is. With no thrusters fitted it
  reads `none`.
- The old invisible numbers (a 0–100 meter, 28 a second out and 10 a second back) are gone;
  `state.drive` carries the tank, `sim/drive.js` sizes it (`P.enMax`), and the outpost fills it on
  launch.
- Files: `data/modules.js`, `sim/drive.js` (`driveOf`, `refreshDrive`), `sim/player.js` (burn and
  refill from the drive, small reserve before the boost will light), `sim/session.js` (full tank
  on launch), `ui/hud.js`, `src/index.html`, `styles.css` (the Boost reading).
- Tests: one new (the tank figures on the module and in the drive) plus the drive-shape
  expectations → **60 passing**. No save change: still version 6. `npm run build` needed (580 KB).
- Verified headless: launch 10.0 / 10, boosting 8 → 6 → 4 → 2 a second, boost cut out at 4.78 s
  with 0.5 left, refill 0.5 → 5.5 over five seconds, and no boost under 0.5 units.


## 2026-11-06: Shield power made simple: a flat 2 MJ/s, and shields bleed when it is not there

- **Shields now draw a straight 2 MJ/s all the time** while a shield module is fitted — full,
  filling or under fire, it is the same bill. The 1/2 split is gone, so `chg` is off the module
  and `draw: 2` replaces it.
- **If the ship cannot supply that 2 MJ/s** (powerplant gone and cells flat), the shields stop
  holding themselves together: they **discharge at 1 point a second** (`drain: 1`) down to 0, and
  **stay at 0** until the ship can pay again. Then the normal rule applies — the 4 second lull,
  then 1 point a second back.
- HUD with the basic fit: **2 MJ/s** parked, **4** flying, **5** boosting, **4** while shields
  fill after a fight, **2** with the shields pulled out.
- Files: `data/modules.js` (`draw: 2`, `drain: 1`, `chg` removed), `sim/shield.js`
  (`shieldDraw(shield)` is now flat, `updateShield` discharges when `hasPower()` says no).
- Tests: the shield power tests were rewritten and a discharge test added → **59 passing**.
  No save change: still version 6. `npm run build` needed (579 KB).


## 2026-11-06: Shields cost power: 1 MJ/s up, 2 MJ/s while recharging

- **Basic shields draw 1 MJ/s whenever they are fitted and up**, and **2 MJ/s in total while they
  are actually recharging**. Full shields still cost their 1 MJ/s; the extra 1 only applies while
  points are going back in.
- **The power bill is now a sum.** `state.power` gained `use: { drive, shield }` and
  `sim/power.js` gained `setDraw(system, mjps)`: the thrusters and the shields each report their
  own figure once a frame, and `draw` (what the HUD shows and `hasPower()` checks) is the total.
  A third consumer later is one more name in `use` and one `setDraw()` call.
- **The numbers live on the module** (`draw: 1`, `chg: 1` on `shield_basic`), so a better shield
  can be thirstier without touching code, the way thrusters already work.
- **No power, no recharge**: if the ship cannot pay the bill (no powerplant and empty cells) the
  shields hold where they are instead of filling, exactly as the thrusters lose thrust. They
  still show their standing 1 MJ/s of demand, the same way the drive shows its 2.
- Files: `data/modules.js`, `sim/shield.js` (`shieldDraw`, `updateShield` charges the ship),
  `sim/power.js` (`setDraw`, `refreshPower` clears both shares), `sim/player.js` (drive share),
  `state/state.js` (`power.use`).
- With the basic fit the HUD now reads **1 MJ/s** parked, **3** flying, **4** boosting, and **4**
  while flying with shields filling.
- Tests: 2 new (`shieldDraw`, and the power bill following the shields) plus rescaled
  expectations → **58 passing**. No save change: still version 6. `npm run build` needed
  (579 KB).


## 2026-11-06: Smaller shield numbers: 10 points, 1 a second, 1 damage a shot

Everything shield-related is divided by ten, so the numbers are easy to read at a glance.

- **Basic shields: 10 points** (was 100) and **1 point a second** (was 10). The 4 second lull
  before recharging, and the rule that any hit restarts it, are unchanged.
- **Pirate cannons do 1 damage a shot** (was 10), in `sim/ai.js`, so a fight against basic
  shields still takes the same number of hits: ten to strip the shields, then the hull.
- The shield bar in flight therefore moves a tenth at a time; with a cell-like cap of 10 it
  refills from empty in about ten quiet seconds.
- Tests rescaled to match (shield rules, the module figures, the pirate damage guard) →
  **56 passing**. No save change: still version 6. `npm run build` needed (579 KB).


## 2026-11-06: Shields are a module now; pirate cannons do 10 a shot

- **New module: `shield_basic` ("Basic shields")**, fitted to every hull from the start and
  fittable in the shield bay that was already in the Outfitting layout. It holds **100 shield
  points**, recharges at **10 points a second**, and will not start recharging until the ship has
  gone **4 seconds without being hit**. Any hit inside that lull restarts the clock, so the
  recharge is off for as long as somebody is shooting at you.
- **Shields are no longer a hull stat.** `SHIPS` lost its `sh` field (and the Hangar row no
  longer quotes a shield figure); `sim/shield.js` turns the fitted module into `state.shield`
  (`cap`, `regen`, `delay`) and `P.shMax`. No shield module means no shields: every hit goes
  straight to the hull.
- **Pirate cannons now do 10 damage a shot** (was 7), in `sim/ai.js`. Against basic shields that
  is ten hits to strip them, then ten more for a Wasp's hull.
- **Save version 6.** Saves from v5 or older have an empty shield bay because the group did not
  exist then, so they are retrofitted with basic shields on load (same rule the thrusters got in
  v5). A v6 save where the player really took the shields out stays shieldless. `cleanLoadouts`
  now keeps a list of groups added after a save's version instead of one flag per group.
- Files: `data/modules.js` (`shield_basic`, `STOCK_FIT.shield`), new `sim/shield.js`
  (`shieldOf`, `refreshShield`, `updateShield`), `state/state.js` (`state.shield`),
  `state/profile.js` (v6 + retrofit), `sim/player.js` (no shield stats on the ship, recharge
  moved out of `flight()`), `main.js`, `sim/fitting.js`, `sim/session.js`, `sim/economy.js`,
  `ui/menu.js` (refresh on dock/fit/ship change/load), `ui/hud.js` (bar copes with no shields),
  `ui/screens.js` (`100 shields` in the bay, Hangar row without a shield figure), `sim/ai.js`.
- **Special shields later:** a module that recharges even under fire is one more field read by
  `updateShield()` (for example `live` for a reduced under-fire rate). Nothing outside
  `sim/shield.js` needs to change for that.
- Verified headless: ten 10-damage hits took 100 → 0 shields with the hull untouched, hit 11
  took 10 hull; with a hit at t=0 the shields sat still at 90 through 3.9 s and were full again
  by 5 s; with the bay empty a 10-damage hit cost exactly 10 hull.
- Tests: 3 new files' worth — shield rules (`tests/shield.test.mjs`, 6 tests), the module and
  stock fit, the v5 → v6 retrofit, the pirate damage figure, and equip/unequip moving `P.shMax`
  → **56 passing**. `npm run build` needed (579 KB).


## 2026-11-06: Lighting the boost costs a flat 20 MJ; refilling the meter is free

The boost now works like a car ignition: expensive to start, cheap to run, and filling the tank
costs nothing at all.

- **Ignition: 20 MJ in one gulp.** When the spool-up finishes and the shake fires, 20 MJ comes
  straight out of the cells (`ign: 20` on `thruster_basic`). With the basic 100 MJ cell that is a
  visible 100 → 80 drop in the bar, and the boost **will not light** unless the cells hold 20 MJ.
- **Burning the boost: 2 + 1 = 3 MJ/s.** The extra 1 MJ/s (`boost: 1`) is now charged only while
  the boost is actually firing, instead of while the meter was filling.
- **Filling the boost meter costs nothing.** The old +1 MJ/s charge draw is gone; the meter still
  fills itself at the same rate, free, at any throttle setting.
- Everything else stands: 2 MJ/s while the throttle is off centre, nothing at exactly zero, and a
  ship with no power has no thrust (the speed winds down).
- Files: `data/modules.js` (`boost` replaces `chg`, `ign: 20`), `sim/drive.js` (`driveOf` carries
  `boost`, `driveDraw(drive, throttle, boosting)`), `sim/player.js` (draw from the burning boost,
  ignition takes 20 MJ out of `stored` and needs that much there, meter refills free),
  `sim/power.js` (comments).
- Verified headless: idle = 0 MJ/s with the boost filling free; flying = 2; boosting = 3; the
  ignition frame dropped the cells 20.03 MJ; with 15 MJ in the cells, Shift did nothing at all.
- Tests: the existing power tests were updated to the new figures → **46 passing**. No save
  change: still version 5. `npm run build` needed (578 KB).


## 2026-11-06: Thrusters use power, and a dry cell winds the speed down

Basic thrusters now drink from the power cells. The numbers live on the module in
`data/modules.js` (`draw: 2`, `chg: 1`, `ign: 1`), so a better thruster can be thirstier.

- **2 MJ/s whenever the throttle is off centre** — 100%, 99%, 1%, -1%, -30%, -100% all count.
  Only a throttle of exactly zero (X, or hands off once it has been set to 0) draws nothing.
- **1 MJ/s more while the boost meter is filling.** The meter fills by itself whenever the ship
  has power to spare, so the readout often sits at 1 MJ/s when the ship is idle and at 3 MJ/s
  while flying and charging.
- **1 MJ flat, each time the boost lights.** Charged on the frame the boost engages, out of the
  cells' stored energy.
- **Out of power means no thrust, and the speed winds down.** `hasPower()` in `sim/power.js`
  answers whether the cells (or a plant that covers the demand) can pay; when they cannot, the
  drive's speed is treated as 0 and the usual drag model bleeds the speed away instead of
  stopping the ship dead. Boost is refused too. Turning still works, so a dry ship can aim.
- Files: `data/modules.js` (draw/chg/ign), `sim/drive.js` (`driveOf` carries them, new
  `driveDraw`), `sim/power.js` (new `hasPower`), `sim/player.js` (sets `state.power.draw`,
  gates thrust on power, charges and ignition costs), `ui/hud.js` unchanged (it already shows
  `Using X of Y MJ/s`).
- Verified headless: full throttle = 2 MJ/s, throttle 0 with a full boost = 0, idle charging =
  1, flying + charging = 3; ignition takes exactly 1 MJ plus the frame's 2 MJ/s; with no plant
  and 3 MJ left the ship went 52 → 33 → 21 → 14 → 9 → 5 → 2 m/s after the cells emptied.
- Tests: 3 new (`driveDraw` for every throttle setting, the power figures on the module,
  `hasPower`) → **46 passing**. No save change: still version 5. `npm run build` needed (578 KB).
- **Consequence to know about:** a plant-less ship that flies until the cells empty cannot fly
  home. That is the point of the rule; docking is only possible if you get back first.


## 2026-11-06: "Equip thrusters to move" warns you when a dead ship ignores the controls

- Undocking with no thrusters and then pressing **anything that would move the ship** now shows
  the warning **"Equip thrusters to move"** in the centre of the screen. It covers W/S (thrust),
  A/D (strafe), Space/C (lift), Q/E (roll), Shift (boost) and the mouse, and it repeats every
  three seconds while a control is still held, so it reads as a reminder instead of flickering.
- Nothing else changed: the ship still cannot move, turn or boost, the throttle stays at 0, the
  launch message and the standing hint line ("No thrusters fitted: press G to dock and fit one.")
  still explain how to get back to the outpost.
- The warning lives in `sim/player.js` (`tryingToMove()`, `NO_DRIVE_WARN`, `state.player.noDriveT`)
  and is shown with the ordinary centre-screen message, so it never stacks up.
- Tests: a guard test keeps the exact wording and the "only when a control is pressed and there
  is no drive" rule in place → **43 passing**. No save change: still version 5.
  `npm run build` needed (578 KB).


## 2026-11-06: No thrusters means no movement, no turning and no boost

- **An empty thruster bay is now a dead ship.** `driveOf()` returns `{ spd: 0, turn: 0 }`
  instead of falling back to a speed the hull used to carry, so with no thrusters fitted the
  ship cannot thrust, strafe, lift, turn or boost. The throttle is held at 0, so the engines
  stay cold, the boost ramp never starts and the boost bar is never spent.
- **Hulls no longer have `spd`/`turn`** (`data/ships.js`). Speed and turn live only in the
  thruster module; `npm test` now fails if a hull grows a speed of its own again. When hulls
  should handle differently, that is a multiplier in `sim/drive.js`, not a base speed.
- **The player is told, and can get back:** `launch()` puts the ship 200 m from the outpost
  (inside the 300 m docking range, so an immobile ship can dock straight back), refreshes the
  drive, and shows *"No thrusters fitted: the ship cannot move. Press G to dock and fit one."*
  The HUD repeats *"No thrusters fitted: press G to dock and fit one."* while the ship cannot
  move, so the dead controls have a reason on screen.
- Files: `sim/drive.js` (no fallback, new `hasDrive`), `sim/player.js` (throttle and boost
  gated on the drive), `sim/session.js` (launch distance, message, `refreshDrive()`),
  `ui/hud.js` (prompt), `data/ships.js` (no `spd`/`turn`), `tests/content.test.mjs`,
  `tests/fitting.test.mjs`.
- Verified headless: 10 s holding every control (W S A D Space C Shift, mouse hard over) moves
  an empty-bay ship **0 m and turns it 0°**, on all three hulls; with the basic thrusters
  nothing changed (150 m/s flat out, 295 m/s boost, same turn rate).
- Tests: **42 passing**. No save change: still version 5. `npm run build` needed (578 KB).


## 2026-11-06: Paint bays are clickable, and show an empty colour store

- **The two Appearance bays are buttons like module bays.** Clicking one opens the picker
  rectangle under the card, with a Close button and the message **"No colours in storage."**
  Clicking the open bay again, or Close, shuts it, and the open bay gets the pale blue edge.
- **One picker at a time across the whole screen**: opening a module bay closes an open paint
  picker and the other way round.
- **No paint data and no save change.** Colours will be stored and fitted the same way
  modules are, and this picker becomes that list of colours when they arrive; until then the
  empty message is the whole content.
- The click rule moved into a new `src/ui/picker.js` (`toggleModulePicker`,
  `togglePaintPicker`) so it is a pure function that can be tested without a browser.
  `ui/menu.js` `slot`/`paint` call it, and `fit`/`unfit` now check that the open picker is
  really a module bay. `state.ui.fit` gained a `kind` field ("module" or "paint").
- Tests: 3 new in `tests/picker.test.mjs` (the toggle, one-at-a-time, and paints and modules
  sharing the picker). `npm test` now runs 40.
  `game/tallow-reach.html` needs `npm run build` (577 KB).


## 2026-11-06: Fix: the Appearance bays lost their boxes

- The two paint bays on the **Appearance** card are plain divs, while module bays are now
  buttons. When the bays became clickable, the box styling (border, background, padding,
  grid) was written on `button.mod-bay`, so the paint bays no longer matched any rule and
  collapsed into bare inline text reading **"PRIMARYEmpty"**.
- The box is back on the bare `.mod-bay` class, which every bay uses whatever its tag;
  `button.mod-bay` now only carries the button reset (font, colour, cursor). The Appearance
  card is two dashed boxes side by side again, "Primary / Empty" and "Secondary / Empty",
  the same size as the Primary weapons bays.
- Tests: 1 new guard (now 37) that reads `src/styles.css` and fails if the box properties
  ever move onto the button selector again. No save or gameplay change.
  `game/tallow-reach.html` needs `npm run build` (577 KB).


## 2026-11-06: Basic thrusters, and every hull flies like the Wasp

- **The thruster bay has a module now**: `thruster_basic` in `src/data/modules.js`, "Basic
  thrusters", top speed **150 m/s** and turn **1.2** — the Wasp's old hull figures, copied
  exactly, so a Wasp with them fitted flies precisely as it did before modules existed.
  Boost is still 2x, strafe/lift/reverse are still the `FLIGHT` fractions.
- **Speed and turn now come from the thrusters, not the hull.** New `src/sim/drive.js` turns
  the fitted thruster into `state.drive = { spd, turn }`; `sim/player.js` and
  `render/camera.js` read that and nothing else. Measured in a headless flight probe:
  Wasp, Prospector and Bulwark all reach **150 m/s**, **295 m/s** on boost and turn at
  **69 deg/s** — identical, as asked. Hull differences are a later job and belong in
  `driveOf` as multipliers.
- **A hull with no thrusters fitted falls back to its own `spd`/`turn`** from `data/ships.js`
  (measured: Bulwark 90 m/s, 40 deg/s). That is deliberate: without it, a player who unequips
  the drive and launches would be stranded in space with no way back to the outpost.
- The Outfitting card shows `Basic thrusters` / `150 m/s` and the count `1 / 1`.
- **Save: `SAVE_VERSION` 4 -> 5.** The saved shape is unchanged; the version marks the point
  from which thrusters exist. A save made before 5 has its empty thruster bay filled with the
  stock drive on load (that bay was never a choice), while a save at 5 keeps a bay you chose
  to empty empty.
- Tests: 2 new and 1 extended (every hull flies like the old Wasp on stock thrusters; the
  hull fallback; the thruster module's fields; unequip/refit moving `state.drive`).
  `npm test` now runs 36. `game/tallow-reach.html` needs `npm run build` (576 KB).


## 2026-11-06: Click a bay to fit a module, or unequip one into storage

- **Every module bay is a button.** All eight bays across the seven groups can be clicked.
  Clicking one opens a **picker rectangle under that card**; clicking the same bay again, or
  **Close**, shuts it. Only one picker is open at a time.
- **The picker holds squares, one per stored part that fits that group**, each with the
  part's name and number (`Basic powerplant` / `10 MJ/s`). With nothing stored it reads
  **"No modules in storage."** exactly as asked, and that is what a new game shows.
- **Unequip**: a filled bay gets a button at the bottom of its picker, "Unequip Basic
  powerplant to storage". The part leaves the bay, lands in the new module store
  (`profile.modules`) and appears in the picker as a square, ready to go back in. Fitting
  into a full bay swaps, sending the part it replaced to storage.
- **Fitting is instant and updates the ship at once**: every fit/unequip refreshes the power
  budget, so taking the powerplant off turns 10 MJ/s into 0 MJ/s before you launch. Docked,
  the cells refill as usual.
- **Nothing can be bought yet**, so the only way to get a part into storage is to take it off
  a hull. That is deliberate: the shop is the next step.
- Save: **`SAVE_VERSION` 3 -> 4**, adding `profile.modules` (a list of module ids). Older
  saves load with an empty store and their fitted parts untouched; unknown ids are dropped
  and a corrupted value empties the store rather than failing the load.
- Files: new `src/sim/fitting.js` (`fitModule`, `unequip`, `storedFor`, `fittedAt`);
  `ui/screens.js` (bay buttons and the picker), `ui/menu.js` (`slot`, `fit`, `unfit`
  actions), `state/state.js` (`ui.fit`), `styles.css`, `state/profile.js`.
- Tests: 6 new in `tests/fitting.test.mjs` (new game, unequip, re-fit, the refusals, the
  swap, and the old-save migration). `npm test` now runs 34.
  `game/tallow-reach.html` needs `npm run build` (576 KB).


## 2026-11-06: Basic powerplant and power cell, with a power bar in flight

- **Modules exist.** `src/data/modules.js` holds the first two: **Basic powerplant** (10 MJ/s)
  and **Basic power cell** (100 MJ). Every hull is delivered with both fitted.
- **Per-hull bay layouts.** Bay counts moved out of `MODULE_GROUPS` into `SHIP_LAYOUTS`
  (`src/data/outfitting.js`), one entry per hull. All three are a straight copy of the Wasp's
  today (1 powerplant, 1 cell, 1 thruster, 1 shield, 2 primary, 1 secondary, 1 hull), so a big
  hull can be given a different arrangement later by editing its own line. `slotsFor()` and
  `layoutFor()` are the only readers; a test fails if a hull is missing a group's count.
- **The Outfitting screen shows what is fitted.** Fitted bays are now solid, with the part's
  name and its headline number (`Basic powerplant / 10 MJ/s`), and the group count reads
  `1 / 1`. Empty bays still read `Empty`.
- **Power in flight.** New `src/sim/power.js` turns the fitted modules into
  `state.power = { gen, cap, stored, draw }` (10 MJ/s, 100 MJ, 100 MJ, 0 MJ/s at the start) and
  charges the cells every frame. Bottom centre, above the throttle line, the HUD now shows a
  **Power cell** bar with `100 / 100 MJ` and `Using 0 of 10 MJ/s`. It reads `No power cell` if a
  hull has none fitted. Cells are full when you launch and topped up by the outpost on dock.
- **Nothing draws power yet.** `draw` is 0, so the bar sits full; the first system that needs
  energy (shields, the mining beam) only has to add to `state.power.draw` and the cells start
  moving. That is the one line to remember.
- **Save change: `SAVE_VERSION` 2 -> 3**, adding `profile.loadout`: per hull, per group, one
  entry per bay (`null` for empty). Old saves and new hulls get the stock fit
  (`STOCK_FIT` in `data/modules.js`); a bay the player really emptied stays empty, unknown
  module ids and bays beyond a hull's layout are dropped. A ship bought in the Hangar comes
  with the stock fit; a destroyed ship's loadout is deleted with it.
- Tests: 4 new (module data and its group, every hull's layout, a new game's 10 MJ/s into
  100 MJ, the old-save migration and dropped modules, and the charge/overflow/empty maths).
  `npm test` now runs 28. `game/tallow-reach.html` needs `npm run build` (572 KB).


## 2026-11-06: Powerplant talks in MJ/s, not MW

- The Powerplant card now reads **"Energy the ship makes every second, in MJ/s."** instead of
  "Power the ship produces, in MW." The Power cells card reads **"Energy the ship can hold,
  in MJ."** Both cards now describe energy in the same units, one "per second in", one
  "stored", which is easier to read than a megawatt with nothing to compare it to.
- **This is wording only.** 1 MJ/s is exactly 1 MW, so any module numbers written later mean
  the same figure in either unit and nothing needs rebalancing.
- One file changed: `src/data/outfitting.js` (`MODULE_GROUPS`). No gameplay, save, layout or
  visual change. Tests unchanged at 24. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-06: Appearance card under the Hull bay

- **New card at the bottom of the right-hand column: Appearance**, directly under the Hull
  group. It holds **two paint bays, Primary and Secondary**, both reading `Empty` with a
  `0 / 2` count, and a line saying the standard livery is used until a colour is fitted.
- It is layout only. **No paint exists, nothing can be bought or fitted, and no gameplay,
  save field or `SAVE_VERSION` changed.** Paints will be bought, stored and fitted the same
  way modules are; the card is drawn by the same code as the module cards, so they will
  look identical when that arrives.
- The bays come from the new `APPEARANCE_SLOTS` in `src/data/outfitting.js` (`k` id, `n`
  name). Add an entry and one more paint bay appears; the card always sits last, under the
  hull group, so adding module groups does not move it.
- `ui/screens.js`: `appearanceHtml()`, appended last in the right rail. The screen's intro
  line now says modules and paints arrive in a later update.
- Tests: 1 new (the two paint slots have unique ids and names, primary before secondary).
  `npm test` now runs 24. `game/tallow-reach.html` needs `npm run build` (569 KB).


## 2026-11-06: Outfitting screen with a 3D ship viewer

- **New tab: Outfitting**, between Hangar and Shop. On this tab the outpost panel opens
  up to the middle of the screen (`#panel.wide`, up to 1180 px), so the ship has room.
- **The ship sits in the middle of the screen** in its own 3D window, drawn by a second
  renderer (`src/render/shipviewer.js`) on a transparent canvas over a dark gradient.
  It turns slowly on a display ring; drag to spin it, scroll to zoom, double click to reset.
  The idle turn pauses for 3 s whenever you take hold of it, and is off altogether if the
  system asks for reduced motion. Ships are normalised to the
  same bounding sphere, so no hull is clipped and none looks tiny.
- **Module groups surround it**, four down the left and three down the right, in the same
  card for every group: name, `filled / bays` count, one bay box per slot (all read
  "Empty"), and a line saying what the group decides. The layout is driven entirely by
  the new `src/data/outfitting.js`, so adding a group there is enough (recipe 15).
- **Bays today:** powerplant 1, power cells 1, thrusters 1, shields 1, primary weapons 2,
  secondary weapons 1, hull 1. Nothing is fitted and **no module exists in the game yet**;
  no gameplay number, save field or balance was touched, and `SAVE_VERSION` is unchanged.
- `ui/outfitting.js` mounts the viewer into `#shipview` after every panel redraw (the panel
  rebuilds its HTML, which throws the canvas out but does not destroy it) and draws one
  frame from the main loop through `updateOutfitting(dt)`. It does nothing unless you are
  docked on that tab.
- The ship window needs WebGL; if the browser refuses a second context the panel says so
  instead of showing an empty box.
- Tests: 1 new (`MODULE_GROUPS`: unique ids, a name and description each, whole-number bay
  counts, `slotsFor` agrees, and the intended 2 primary bays / 1 everywhere else).
  `npm test` now runs 23. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: The chase camera stops running away at speed

- **The view no longer backs off as you accelerate.** It used to trail further the faster you
  went: 16.8 units behind the ship at 37% throttle, 26.9 at full throttle, and **43 at full
  boost**, which read as the camera flying backwards.
- The trail is now a fixed, bounded line in speed (`CAMERA` in the new `src/data/camera.js`):
  **11.0** standing still, **17** at full forward speed (throttle 1 plus boost) and **10.5** at
  maximum reverse. Everything between is linear in speed, and the two ends are hard limits, so
  no speed can push the view past 17 or pull it closer than 10.5. Measured in game: idle 11.0,
  100% throttle 13.9, full boost 17.0, full reverse 10.5.
- Both limits are per hull (`spd * 2` forward, `spd * FLIGHT.reverse` backwards), so the slower
  ships reach the same numbers at their own top speed instead of trailing less forever.
- **Two real bugs behind the old behaviour**, both fixed in `render/camera.js`:
  1. The chase point was built with `localToWorld()`, which reads `matrixWorld` — a matrix only
     refreshed when the scene is drawn, i.e. last frame's transform. The offset therefore
     included one frame of the ship's travel, growing with speed. It is now built from the
     ship's position and quaternion directly.
  2. The camera eased its position in world space toward that point, so the ship's own travel
     counted as camera error and the steady-state gap was `speed / 10`. The camera now rides
     along with the ship's per-frame movement (`_delta`) and eases only the offset, so speed
     cannot drag it back at all. Turning still swings the view (about 5 degrees of trailing at
     full stick), and a jump to a new sector is ignored so the arrival still snaps cleanly.
- Tests: 1 new (`cameraTrail` is bounded, monotonic, and hits 11 / 17 / 10.5 at idle / top /
  reverse). `npm test` now runs 22.
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: Flight feels heavier: slower turn, weak side/reverse thrusters

- **Turning:** every hull now turns at 70% of its old rate (`FLIGHT.turn = 0.7`). Each ship's own
  `turn` stat still sets the character of the hull, so a Wasp is still twice as nimble as a Hauler;
  the 0.7 is applied on top. Measured in game (Wasp, stick held hard over): 66 deg/s, against
  99 deg/s before, a ~30% reduction.
- **Forward thrust is unchanged.** `spd` is still the top speed of the main drive and Shift still
  doubles it.
- **Sideways, vertical and reverse thrusters are now a fraction of the forward drive:** strafe
  (A/D) 30%, lift (Space/C) 30%, reverse (S below zero throttle) 30%. Measured strafe settles at
  45 m/s on the Wasp (0.3 x its 150 m/s forward speed) and boost still peaks at 2x forward (292 m/s
  observed). The point is that a ship is fastest going forward; its manoeuvring thrusters are not.
- The fractions live in one new table, `FLIGHT` in `src/data/ships.js` (`turn`, `strafe`, `lift`,
  `reverse`). `sim/player.js` reads it, so this is now the single place to retune the feel of
  every ship at once. The old hard-coded `0.45` strafe and `0.4` lift are gone.
- Tests: 1 new (the `FLIGHT` fractions are per-ship fractions of `spd`, and `turn` is a 0..1
  multiplier). `npm test` now runs 21.
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: Warp lets the ship coast and unwind, instead of freezing it

- Pressing M no longer slams the ship to a halt or snaps its turn off.
- **Speed:** the throttle is released (exactly as pressing X does) and the existing drag model
  bleeds the speed off, so you coast down. Measured from 102 m/s: 94, 82, 75, 66, 60, 55, 48,
  44, 38 m/s across the charge. `startWarp()` no longer zeroes `P.v`; only the arrival does,
  under the white-out, where it cannot be seen.
- **Turning:** the stick position (mouse x/y and Q/E roll) is captured when the drive engages
  and eased back to neutral over the new `WARP_COAST.steer` (0.6 s) in `data/sectors.js`, via
  the pure helper `warpSteerEase(t)`. A held turn keeps turning for a moment and winds down.
  Strafe, lift, boost and throttle input are ignored for the whole sequence.
- `sim/player.js` no longer returns early during a warp. It runs the whole flight model with
  the inputs released, so momentum, drag, asteroid collisions and shield recharge all behave
  normally while the drive is engaged. Weapons are still cut, in `sim/weapons.js`.
- Removed the `P.snap` camera lock added with the roll fix: with the roll gone it only caused
  a small jump on the frame M was pressed. The camera simply keeps tracking the ship, which is
  now easing its turn out.
- Tests: 1 new (`warpSteerEase` is 1 at the start, about half way through, 0 after, and the
  ease finishes before the sector changes). `npm test` now runs 20.
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: Fix: no rotation when warping

- Pressing M no longer turns or tilts the view. `render/camera.js` no longer rolls the
  camera during a warp; the FOV widening stays.
- Why it happened: the roll was added as a **fixed 0.05 radians per frame** instead of
  per second. That is a hidden frame-rate dependency — at 30 fps it was a slight 6 degree
  lean, but on a 144 Hz or 240 Hz display the same code compounded into a huge rotation over
  the two-second warp, which is what the player saw ("the ship rotates right and it warps
  when it is about 180 degrees").
- `sim/sectors.js` also sets `P.snap = true` when a warp starts, so the chase camera locks
  onto the ship's heading on that frame instead of continuing to catch up. Nothing swivels
  when the drive engages.
- Measured after the fix: the ship's apparent roll across a whole warp changes by less than
  0.5 degrees (it was 6 degrees at 30 fps before, and much more at high refresh rates).
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: Warp animation, warp sound, and a two-second warp

- A warp is no longer instant. It is a sequence of about two seconds, tuned by the new
  `WARP` block in `data/sectors.js`: `charge` 1.1 s (drive spins up), `flash` 0.18 s
  (white-out, and the sector changes at the start of it), `settle` 0.72 s (drive winds
  down). `WARP_TIME`, `WARP_SWITCH_AT`, `warpPhaseAt(t)` and `warpFlashAt(t)` are exported
  so the visuals and the tests read the same numbers.
- **Control is locked for the whole sequence.** `sim/player.js` pins the ship (throttle and
  drift zeroed) and `sim/weapons.js` skips cannons, the beam, lock-on and missile launches;
  missiles already in flight keep going. Docking is refused mid-warp (`main.js`). Control
  comes back on the frame the sequence ends.
- `state.warp` holds the sequence while it runs: `{ from, to, t, fx, flash, switched }`.
  `fx` runs 0 -> 1 -> 0 over the whole warp and drives the visuals; `flash` peaks at 1 at
  the moment the sector changes. Both are recomputed from the clock every frame, so the
  picture cannot drift from the simulation.
- Look: `render/warpfx.js` draws 130 additive line streaks hanging off the camera, which
  close on the ship faster and stretch as the drive builds. `ui/warpflash.js` adds two
  full-screen gradients (a tunnel vignette that follows `fx`, and the white-out that follows
  `flash`). `render/camera.js` widens the FOV by up to 16 degrees and rolls slightly during
  the warp. No post-processing and no new dependencies.
- Sound: `warpCharge(dur)` in `core/audio.js` (rising whine, air rushing past, sub-bass
  swell) and `warpBurst()` at arrival (noise slam, thump, shimmer). Both are procedural, like
  everything else.
- New events: `warp-start { from, to }` and `warp-end { from, to }`, listed at the top of
  `util/events.js`. `sector-changed` now fires mid-warp, at the white-out.
- A warp is cancelled by docking (`sim/session.js`), which covers dying mid-warp: you never
  end up half-way between sectors.
- Performance note for the next session: the first version of the overlay (a masked
  `repeating-conic-gradient` behind a CSS mask) halved the frame rate, 32 -> 13 fps in a
  software renderer. It was replaced with the 3D streaks plus two plain gradients, which
  measures 32 -> 26 fps. Keep the overlay to plain gradients.
- Tests: 2 new (`warpPhaseAt` order and length, `warpFlashAt` shape). `npm test` now runs 19.
- Save format: unchanged (`SAVE_VERSION` stays 2). Warp state is runtime only.
- `game/tallow-reach.html` is unchanged; run `npm run build` to regenerate it.


## 2026-11-05: Second sector, warp on M

- There are now two sectors. **Tallow Reach** is the old one (outpost, planet, asteroid
  field). **Kestrel Hollow** is new and deliberately empty: you arrive in open space with
  nothing in it, and none of Tallow Reach's scenery, markers or rocks can be seen from it.
- **M warps** to the next sector on the chart and back again (an action, so it goes through
  `core/input.js` -> `main.js` like the other keys). It only works while flying: not docked,
  not paused. A warp clears hostiles, shots, crates and particles, drops you at the sector's
  arrival point at rest, and snaps the camera.
- New `src/data/sectors.js`: the sector table (`n`, `d`, `sn` arrival point, and the flags
  `st` outpost / `fd` field / `foes` raiders), `SECTOR_IDS` (the warp order) and
  `DEFAULT_SECTOR`. Tuning and new sectors go here.
- New `src/sim/sectors.js`: `enterSector(id)` and `warpToNext()`.
- `render/scene.js` now gives each sector its own `THREE.Group`, made on first use, with
  `sectorGroup(id)` and `showSector(id)`. The outpost, planet and atmosphere are built into
  the starting sector's group, so hiding a sector is a visibility toggle. The starfield is
  the backdrop of every sector, so it stays.
- `sim/world.js` keeps a parked rock list per sector, so `state.world.asteroids` always
  holds the current sector's rocks and every system can keep reading it directly. Mining,
  collisions, lock-on, bullets and missiles therefore find no rocks in Kestrel Hollow, and
  the field comes back exactly as you left it (same rocks, same mined-out ones).
  Also new: `clearWorldObjects()` (clears crates and particles too, used by the warp).
- Everywhere that assumed the outpost sits at the origin now checks the sector flags:
  the keep-out bubble (`sim/player.js`), docking (`sim/session.js`, which also returns you
  to the starting sector), station lock-on (`sim/targeting.js`), the pirate spawner
  (`sim/ai.js`) and the HUD markers and dock hint (`ui/hud.js`).
- The HUD's top-right readout now starts with the sector name.
- New event `sector-changed { from, to }`, listed at the top of `util/events.js`.
- Docs: how-to recipe 14 (a new sector) added; folder READMEs updated.
- Save format: **unchanged** (`SAVE_VERSION` stays 2). `state.sector` is runtime only, so you
  always launch in Tallow Reach and a reload puts you back there. No migration needed.
- `game/tallow-reach.html` is unchanged; run `npm run build` to regenerate it.


## 2026-11-05: Project tidy for growth (no gameplay change)

- Contract types are now defined in one place. `data/contracts.js` has `CONTRACT_TYPES`,
  `CONTRACT` generators and a new `DESCRIBE` table. The offer board (`sim/contracts.js`), the
  saved-game loader (`state/profile.js`) and the contract wording now read from it. Before, the
  number `3` and the type list were repeated in three files, so adding a fourth type would
  have failed silently. Output was checked identical to the old code across 3,000 seeded boards.
- `ui/screens.js`: outpost tabs are drawn through a `SCREENS` table instead of an if-chain.
  Two very long text lines were split into readable pieces. The HTML produced is identical.
- `styles.css` reformatted to one declaration per line with labelled sections. Verified equivalent
  to the old file after minifying.
- New: `docs/HOW_TO_ADD.md` (recipes), a `README.md` in each `src/` folder, "File map",
  "Conventions" and "Known gaps" sections in `docs/ARCHITECTURE.md`, this changelog.
- New tests: `tests/content.test.mjs` checks every ship, item, weapon, base module and contract type.
- `package.json`: `npm test` now runs `node --test` (the old `node --test tests/` form fails on newer Node versions).
- Save format: unchanged (`SAVE_VERSION` stays 2).
- `game/tallow-reach.html` was updated by hand-patching, because the build tools were not
  available in that session. It plays identically to a fresh build. Run `npm run build`
  once to regenerate it cleanly.


## 2026-11-05: Pause menu and mute

- The M key no longer mutes. `KeyM` was removed from `BINDINGS` in `core/input.js` and the
  `mute` case from `main.js`.
- The pause menu (`ui/pause.js`) now has four rows: big PAUSED, "P or Esc to resume", a
  Sound on/off switch (it calls `toggleMute()` in `core/audio.js`), and the Resume button.
  Styles are under "Pause overlay" in `styles.css`.
- Help texts that mentioned the M key were updated (`index.html`, `ui/screens.js`).
- Save format: unchanged. Mute state is not saved, so sound starts on every time.


## 0.2.0: Baseline

- Modular source split out of the original single-file prototype (`reference/original-tallow-reach.html`).

