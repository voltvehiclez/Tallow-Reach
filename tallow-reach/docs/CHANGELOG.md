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

## 2026-11-08: Show the active route in flight

- Owner requested the route destinations beneath the left boost bar. The flight HUD now shows the
  same remaining system stops and exact-pocket destination as the starmap, plus the J hint or no-route
  status. Long lists scroll independently; mouse wheel and clicks on the list do not control the ship.
  It hides when cleared or reached, updates immediately on place/destination changes and rechecks
  travel conditions twice a second. Route display does not change travel, progress or save data.
- Added shared `src/ui/route-display.js`, HUD markup/styles and `tests/hud-route.test.mjs`.
  Targeted **41/41**, full **328/328**, build **683 KB (699,351 bytes)**. Browser playtest pending.

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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
