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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
