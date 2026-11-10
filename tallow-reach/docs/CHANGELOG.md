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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
