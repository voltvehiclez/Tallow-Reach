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
- **Rule:** when this file holds more than 15 full entries, move the oldest ones to the top of
  the archive (word for word, newest first) until 10 remain, and add one index line for each
  entry moved, at the top of the index. Do this in the same change that adds the new entry.
- Never delete an entry. History is only ever moved.

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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
