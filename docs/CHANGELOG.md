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

## 2026-11-16: Paid boost ignition and ten-slot weapon hotbar

Reproduced free full-throttle jumps on Shift taps/dry ignition in failing tests. Throttle
now snaps only after boost spool-up succeeds and the flat MJ cost is deducted. Held boost
does not continually pin throttle. Existing continuous draw timing is unchanged.

Added ten boxed weapon slots above the throttle: primary 1–5, secondary 6–0, exact
Outfitting bay order, independent cyan/orange selections. Each weapon family has a shared
SVG icon (module.weaponFamily), fitted markers and missile ammo count. Clicks select but
do not fire. Empty/unsupported slots remain empty and never fall back. Removed redundant
top-right selected-weapon line. Secondary fire resolves the selected bay; switching clears
acquisition but keeps reload/ammo. No extra bays added to ships. Optional v21 sw defaults
to first secondary; pw accepts 1–5, preserving legacy beam/cannon migration.

Tests cover paid ignition, ten bindings, both fire banks, empty slots, reload preservation,
pilot isolation, save defaults, family icons and UI. Build regenerated; owner playtest
pending in `testing/TESTING-BATCH2.md`. Other slices remain pending; no merge yet.

## 2026-11-16: HUD pool units

Shield and Hull current values now include HP (e.g. 10 HP); Boost includes U for
fuel units (e.g. 10 U). Power remains MJ. Labels, percentages, spacing and gameplay
are unchanged. Updated HUD tests; save v21; build regenerated.

## 2026-11-16: Tight HUD readings, pool percentages and throttle fill

Moved label and number edges closer so their gap matches the 8px column gap. All
four pools show current values only (Power retains MJ), with percentage underneath.
Power usage sits inside the Power column below its readings. Throttle text now sits
inside a horizontal bar, empty at 0 and full at 100%; speed stays separate below.
Raised the columns slightly to fit the extra readout lines. Absent pools show 0/0%.
Updated formatting/layout regression tests. Save v21; build regenerated. Visual
playtest pending; remaining batch slices unchanged.

## 2026-11-16: Mirrored vertical HUD pairs

Owner's slice-1 layout follow-up: shortened flight labels to Hull/Shield. Hull takes the
previous inner-left column's X position; Shield moves just outside it. Power becomes a
matching vertical meter at the old Boost X position; Boost moves just outside Power.
Both pairs use an 8px gap, with labels/numbers fanning out to avoid overlap. Final order:
Shield / Hull — open centre — Power / Boost. Numeric MJ and MJ/s readings remain; narrow
windows lift both pairs together. Updated HUD/layout tests. Save v21 unchanged; build
regenerated. Owner visual playtest pending; other batch slices remain pending.

## 2026-11-16: Feature batch 2 slice 1 — compact flight meters and toggle camera

Implemented items 1 and 12 only. Hull/Shield now fill upward in small columns left
of the existing horizontal MJ bar; Boost is a column on the right. Numeric readings
remain, with absent/invalid pools safely empty. Route retains its top-left location.
Left Alt toggles free camera once per non-repeat press; release no longer disables it.
Existing modal/blur/dock/warp reset paths remain; pause now exits orbit too. Updated
help text and tests. Save v21 unchanged. Build regenerated; owner visual playtest pending.
Full batch plan and per-slice checklist: `testing/TESTING-BATCH2.md`. Other items pending.

## 2026-11-16: Nebula fill intensity increased 25%

Owner approved the ambient lighting and requested a 25% increase. Default intensity
is now 0.125 (was 0.10). Tint, softness, overrides and other lights are unchanged.
Updated the default regression assertion and recipe 24. Save v21; build regenerated.

## 2026-11-16: Subtle sky-tinted ambient fill trial

Added one flight-scene AmbientLight at intensity 0.10, using active skybox generated
nebula-tint metadata softened 60% toward white. Normal space has a restrained cyan fill;
grey skies switch tint on arrival. No runtime pixel sampling, exposure changes, sunlight
changes or material edits. Existing hemisphere and title/outfitting lighting stay unchanged.
`data/lighting.js` supports global, sky-id and per-place sky.ambient tint/intensity overrides;
null tint restores automatic colour, zero intensity disables the extra fill. Recipe 24
explains tuning. Missing sky disables fill. Tests cover defaults, overrides, transition
wiring and invalid settings. Save v21; build regenerated. Owner darkness/colour playtest pending.

## 2026-11-16: Exact F picking for all objects; stationary outfitting preview

Owner approved mission log and preview angle. Kept yaw/pitch unchanged and removed automatic
preview rotation entirely (manual drag/zoom/reset remain). F now raycasts visible rendered mesh
surfaces for every lockable kind: enemies, rocks, crates, stations, rifts/wormholes, exits and
caches. Tagged model roots include GLB children and live animated station parts. Faint auras
and invisible meshes do not intercept the ray. Sim receives only a plain target reference,
checks live candidates, then preserves same-target unlock and no-hit angular assistance.
Headless callers retain the existing sim intersection fallback. Regression tests cover every
kind, overlapping bodies, station holes, child transforms, hidden geometry and preview stability.
Save v21 unchanged; build regenerated. Follow-up owner playtest pending; PR #39 remains unmerged.

## 2026-11-16: Part 2 restored, precise asteroid selection and recovery/UI follow-ups

Continuation starts at main after PR #38; previous unpushed Part 2 was absent, so restored
approved shape-preserving map/HUD icons, mechanical undock, modules-only Base and persistent
Home Station. Optional backward-compatible v21 homeStation defaults to Meridian and validates
against the restored galaxy; temporary/invalid homes fall back safely. No version bump per owner.

Reproduced F selecting a large background rock and credits suppressing the only-ship loaner in
failing tests. F now ranks actual asteroid surface hits along the rendered camera ray before
angular assistance (other target kinds keep sphere proxies). Mission cards use compact grid
spacing, one-line next guidance and a small native Details control containing untruncated
information. Outfitting/reset starts front/top/left isometric. Death with no surviving hull now
always lends a fitted Wasp regardless of credits; a surviving hull is reused, not duplicated.
Ship ownership remains global: no new per-station ship-storage system was invented.

Regression tests cover overlap/mesh misses, generated home recovery, old saves/export-import,
invalid/temporary homes, rich pilots, existing hulls, icons, preview pose and Details. Build
regenerated; owner visual/audio playtest pending. See `testing/TESTING-PART2.md`. No merge yet.

## 2026-11-16: Feature batch Part 1 — targeting and missile UI (items 4–7)

Nine requested features split into parts. Implemented ONLY items 4–7 here:
F switches directly to a different crosshair candidate; same candidate or empty
space releases the lock. Station identity comparisons use place/feature ids.
Removed target-acquired notification and the redundant Locked label. Selected
hostile names have compact blue shield / white hull percentage-fill bars above;
current enemies have no shields, so the shield bar is empty, not fabricated.
Missile brackets now travel from 106 to 34 px radius (was 58 to 34), with a small
progress bar and percentage below. Valid F-selected enemies override the nearest
crosshair candidate, preserving acquisition when another enemy crosses. Cone,
range, free-camera, no-launcher and warp rules remain unchanged.

Files: `sim/{targeting,weapons}.js`, `ui/hud.js`, `data/weapons.js`, `index.html`,
styles, weapon/instance tests, generated HTML and handoff. Also fixed an unrelated
flaky headless AI test: seed it and assert manoeuvring range, not the old uniform
orbit's 300 m endpoint. No NPC behaviour changed. **Save v21.** Build passes;
**677/677 tests pass**. Owner visual playtest pending; checklist `testing/TESTING-TARGETING.md`.

**Still pending:** 1 map/route icons, 2 compact mission log, 3 mechanical undock
sound, 8 Base-tab cleanup, 9 persistent home-station selection/death respawn.
Do not claim these are implemented. Home-station persistence needs save review.

Part 1 visual follow-up: target bars now fill the label width from the left,
with a right-aligned percentage on each row. Offscreen/behind-camera/clipped
selected targets retain the edge-pinned name/health label but no small target
square; on-screen targets retain both. `ui/target-display.js` provides tested
pure markup/visibility helpers; `hud.js`, CSS, UI README and regression tests
updated. No gameplay/save change. Build passes; **679/679 tests pass**; preview pending.

Owner revision: removed the missile-lock progress bar and percentage, including
numeric acquisition hint. The expanded corner geometry, easing, colours, flash,
lock timing and F-target priority are unchanged. NPC health bars/percentages stay.
Files: `ui/hud.js`, `data/weapons.js`, `sim/weapons.js`, weapon tests, playtest guide,
generated HTML and handoff. Save v21; build passes; **679/679 tests pass**.

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
