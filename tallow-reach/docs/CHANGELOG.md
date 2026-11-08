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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
