# Tallow Reach: roadmap and status

> **The living plan.** Where we are, what is next, what is waiting. Any AI that finishes a step
> **ticks it here** (and adds the date). The game being built is in [VISION.md](VISION.md); how the
> code must change is in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md); the detail of every step
> and its prompt is in [REFACTOR_PLAN.md](REFACTOR_PLAN.md); the current state of the game is in
> [HANDOFF.md](HANDOFF.md).

*Last checked: 2026-11-13.*

**Current position (rewritten 2026-11-13):** the table below is the status. Steps 12 and 13 are ticked after the owner's
playtests. Saves are version **19**. Next: step 14 (instanced places and wormholes).

Long status prose from before this rewrite is in [archive/ROADMAP_STATUS_2026-11-10.md](archive/ROADMAP_STATUS_2026-11-10.md);
the feature details are in [architecture/feature-notes.md](architecture/feature-notes.md).

**This table is the only place step status is kept.** `HANDOFF.md` and `REFACTOR_PLAN.md` link here instead of repeating it.

## The order of work

1. **Refactor steps 1 to 15** ([REFACTOR_PLAN.md](REFACTOR_PLAN.md)): make the code ready to grow.
   Add content in parallel once Milestone A is reached.
2. **Open world content** (the bulk of the game), once Milestone C is reached.
3. **Campaign** (10+ missions), once Milestone D is reached. Per VISION.md it is written *after* the
   open world works.
4. **Multiplayer** (step 16). Designed for from step 6 on; built last.

## Step status

Tick with the date when the game plays identically, `npm test` is green and the owner has played it.

| Step | What | Milestone | Status |
| --- | --- | --- | --- |
| 0 | Backup, `npm test`, play testing/TESTING-BASELINE.md once | start | [x] 2026-11-07 |
| 1 | Enemy registry (`data/enemies.js`, `enemy-killed` event) | A | [x] 2026-11-07 |
| 2 | Seeded randomness everywhere | A | [x] 2026-11-07 |
| 3 | Loot tables | A | [x] 2026-11-07 |
| 4 | Item registry and generic inventory (save v12) | A | [x] 2026-11-08 |
| 5 | Shops and prices from data | A | [x] 2026-11-08 |
| 6 | Sim stops using sound and keyboard | B | [x] 2026-11-08 |
| 7 | Entities are data, meshes are views (7a enemies, 7b everything else in the world, 7c the hull's own view class) | B | [x] **2026-11-08: 7a, 7b and 7c complete; owner playtested 7c.** |
| 7d | Entity view registry cleanup | B | [x] **2026-11-08: owner playtest passed.** |
| 8 | Fixed time step and player-aware flight/combat | B | [x] **2026-11-08: 8a, 8b and 8c complete; owner validated on 240 Hz display.** |
| 8a | Fixed simulation tick and old-versus-new flight tests | B | [x] **2026-11-08: owner playtest passed.** |
| 8b | Player list, local player and per-player controls | B | [x] **2026-11-08: owner playtest passed.** |
| 8c | Player-aware flight, combat, targeting and nearest-player AI | B | [x] **2026-11-08: owner playtest passed.** |
| 9 | Split profile/world save and close step-9 local-only items (save v13) | B | [x] **2026-11-08: owner playtest passed (Milestone B complete).** |
| 10 | Place definitions (systems and pockets), current pocket saved (save v14) | C | [x] **2026-11-08: owner playtest passed (3 bugs found, fixed, confirmed).** |
| 11 | System map, pocket chooser and starmap (100+ systems, save v17) | C | [x] **2026-11-10: 11A/11B owner playtest passed.** |
| 12 | Encounters, place templates, place memory (save v18) | C | [x] **2026-11-13: owner playtest passed** (`testing/passed/TESTING-12-PLACES.md`). |
| 13 | Mission framework; contracts rebuilt on it (save v19) | D | [x] **2026-11-13: owner playtested the mission framework and it passed (13a contracts, 13b story runtime, 13c screens, 13d rules and linter).** Guides are in `testing/passed/`. |
| 14 | Instanced places and wormholes | D | [ ] |
| 15 | Campaign scaffolding (save v20) | D | [ ] |
| 16 | Multiplayer (plan written when reached) | | [ ] |

Save version numbers above are the plan. If a step needs a different one, the AI changes this table.

## Content you can add now (after Milestone A: data only)

Do these as ordinary feature requests (use the feature template in [AI_PROMPTS.md](AI_PROMPTS.md)).
Steps 4 and 5 are built, so these no longer wait for anything: modules, items, loot and shop stock
are all data now (recipes 2, 4, 16 and 17). They are listed below the step table for that reason.

- **More enemy types** (different Hull HP, speed, damage, shields, scale, colour, loot table).
  Factions beyond pirates.
- **More ores, salvage and trade goods**; asteroid types with different ore mixes.
- **Module tiers** (basic, then Mk II, Mk III...) for every group: power, thrusters, shields, hull,
  cannons, beam, missiles. Different weapon kinds (lasers, flak, torpedoes) once the pattern holds.
- **Real hull differences** (speed/turn/shield/bay bonuses as module data or multipliers; today every
  hull is identical apart from the hold). The settled flight feel of the Wasp must not change.
- **More ships**, with their own bay layouts.
- **Paints** for the empty Appearance bays.
- **Shop stock** and prices (a row in `data/shops.js`, recipe 4); a second kind of trader (a new
  `SHOPS` entry — data only, and the first real use of a limited `max` row).

## Content you can add after Milestone C (world data)

- **Place templates** (asteroid belt, derelict graveyard, pirate den, nebula, trade lane, ...).
- **Encounters** (patrols, ambushes, traders, distress calls, caches, hazards).
- **Hand-made special pockets** (a hub, a boss pocket).
- **Wormhole instance templates** (the hard, high-reward content).

## Campaign (after Milestone D)

- At least 10 missions, one file each in `src/data/campaign/`, ordered by `index.js`.
- Start: new game begins in the campaign. End: player becomes a free agent in the open world.
- Replay any completed mission in any order for modest rewards that carry over.
- The AI writing the campaign needs story notes from the owner (add them to VISION.md or a
  `docs/STORY.md`, not into chat only).

## Parking lot (not scheduled; from earlier notes)

- Camera-sampled missile aim (`src/main.js`, `src/sim/weapons.js`): `state.aimDirection` is sampled
  once per animation frame from the rendered camera rather than per simulation sub-tick inside
  `stepSim`. Benign in single-player; revisit when per-player aim input arrives in multiplayer
  (step 16) or if cross-refresh replay determinism is needed.
- **Closed in step 12:** wall-clock asteroid respawn was replaced by stable field slots plus
  `world.placeMemory` simulation-second cooldowns. A loaded place rebuilds an expired slot through
  `place-memory-ready`; `respawn-place` can override a timer. Static encounter crates and one-shot
  patrol groups use the same world memory shape.
- Warp: should enemies keep shooting during the charge, or does a warp grant invulnerability?
  (design decision, undecided).
- Salvage crates are abandoned when you warp out of a pocket. They are session entities and are not
  counted as a cleared encounter until their final crate is actually collected; the static encounter
  rebuilds on a later visit unless its saved cooldown has started.
- Mute state is not saved.
- The world around a resumed pilot is not saved: enemies, crates and shots are session-only, but stable
  asteroid slots and cleared one-shot encounters are preserved in `world.placeMemory`. You return to
  the exact spot with the current place memory, not the same active-entity situation.

## Log

- 2026-11-13: **Station-scoped missions and the docked-panel redraw built; owner browser check pending.** Contract offers are per station (`boardAt`, `world.boards`), the Mission log and Contracts tab list only the missions filed at the station being read (with a count of the rest), and story missions are offered only where their data says (`offeredAt`, linted). Panel buttons now carry mission ids instead of list positions, and `mission-ui-refresh` redraws an open docked panel, so closing the Border Signal's final dialogue shows **Hand in cargo** at once. Existing saves keep their home board; save version stays v19 (additive field). The suite passes 482/482.
- 2026-11-13: **Steps 12 and 13 ticked (owner playtests passed); mission hand-in fix built.** A mission is no longer accomplished by its last step: item-bearing missions keep asking for the hand-in and are paid only when the station hand-in consumes the goods. Dying with a still-owed mission-only item fails the mission with a message; a mission-only hand-in that exists nowhere fails instead of waiting forever. Contract guidance names the station and says "Contract complete", and the flight HUD colours contract names light blue and story names amber. Added `missionObjectivesDone`, `missionHandIn` and the `mission-objectives-done` event, linter rules against claiming completion and against a contract calling itself a mission, and death/UI/wording regressions; the suite passes 465/465.
- 2026-11-10: **Story mission return-home fix built; owner browser recheck pending.** Completed missions no longer fail and disappear when the pilot changes sector, and mission-tagged wave triggers cannot advance another waiting mission. Scripted item hand-offs now wait for enough cargo/station space instead of silently progressing. Added Border Signal return-home, trigger-isolation and blocked-hand-off regressions; the suite passes 371/371.
- 2026-11-10: **Main-menu navigation follow-up built; owner browser check pending.** The pause overlay now has **Exit to main menu** below **Resume**, saving the current resume point before returning to a title screen with disabled **Campaign** first and **Open World** second. Open World keeps the existing `intro` action; the generated HTML and complete-project ZIP are refreshed after the 368-test suite.
- 2026-11-10: **Step 13c screens built; owner browser playtest pending.** Added the data-driven `src/ui/missionlog.js` Mission log tab and live dialogue panel, story-mission start actions, optional portrait/log/pause step fields with v19 save round-trip coverage, and `testing/TESTING-13C-SCREENS.md`. Dialogue does not pause the world unless its mission data requests it.
- 2026-11-10: **Step 13b runtime started; 13c screens remain.** Added data-only dialogue/choice, script, wait, flags/branch, parallel and failure handling to `sim/missions.js`; story scripts can request waves/ships through the AI adapter, set saved per-place state, move inventory, play sounds or warp a pilot. Added the ten-step `The Border Signal` example, v19 save coverage and `tests/step13b-missions.test.mjs`; the dialogue panel and mission-log UI remain 13c.
- 2026-11-10: **Step 13a built; owner playtest pending.** Added `src/data/missions/` and the generic `sim/missions.js` runner. Mine, hunt and salvage contracts now instantiate one-step data missions, several can be active together, and kill/mine/collect/reach/deliver/survive objective events advance the same runner. Save v18 active contracts migrate to v19 `profile.missions`; `profile.flags` is ready for the choice branch planned in 13b. Added `tests/step13-missions.test.mjs` and `testing/TESTING-13-MISSIONS.md`; 13b dialogue/script steps and 13c screens remain.
- 2026-11-10: **Step 12 built; owner playtest pending.** Generated pockets now resolve three data templates with tier-selected encounters (`hostile_patrol`, `friendly_trader`, `derelict`, `resource_cache`), and are filled on load. Generic AI spawners preserve hunt contracts; trader stations reuse Meridian's `SHOPS` definitions with independent station-local storage. Stable asteroid slots, static loot encounters and one-shot patrols use `world.placeMemory` with 420 simulation-second defaults, pause-safe countdowns and `respawn-place` event overrides. `world.stationStores` uses stable station keys and keeps the old v18 `world.store` saves compatible without consuming reserved v19/v20 slots. Added `tests/step12-places.test.mjs`, `tests/station-inventory.test.mjs`, content reference checks and `testing/TESTING-12-PLACES.md`. Step 11 was ticked after the owner confirmed its playtest; Step 12 remains unticked until this new playtest passes.
- 2026-11-07: Vision, target architecture, roadmap and refactor plan written (docs only).
- 2026-11-07: Step 1 (enemy registry) built: enemies are entries in `src/data/enemies.js`, factions in
  `src/data/factions.js`, kills emit `enemy-killed { def, faction }`, plus a headless sim test harness
  (`tests/headless.mjs`). 101 tests green; save version unchanged.
- 2026-11-07: Steps 0 and 1 ticked after the owner played the built game in this version.
- 2026-11-07: Step 2 (seeded randomness) built: `makeRng` added, the six `Math.random()` rolls in the
  sim replaced with `random()`, and `tests/rng.test.mjs` guards it. Old and new code compared side by
  side (rocks, 60 s of raiders, 40 loot rolls): identical. Ticked after the owner's playtest.
- 2026-11-07: Step 3 (loot tables) built: `data/loot.js` + pure `sim/loot.js`, raider drops and the
  asteroid ore mix are data, a crate carries the item it holds. 118 tests green; save unchanged.
  Compared with `main` before the step: 50,000 rocks identical, 200,000 kills at the same odds.
- 2026-11-07: Step 3 ticked after the owner played the loot build and accepted it (merged to `main`).
- 2026-11-07: Step 4 (item catalogue, one inventory per place) built: `ITEMS` in `data/items.js` with
  a category, value, volume and stack rule, and an entry for every module that points at its stats in
  `data/modules.js`; a place is now `{ itemId: count }` (save **v12**, converting v11 and older on
  load, pinned by a real v11 save in `tests/saves/`). 121 tests green. Compared with the previous
  commit: a 29-step scripted session (buy, refuse, move, fill a hold, fit, unequip, buy and switch
  ships, store, load, sell) gave identical credits, stocks, m³ and fitted bays after every step, and
  the Inventory, Shop and Base tabs rendered identical HTML. This replace the first attempt at
  step 4, which was lost when its branch was deleted before it reached `main`.
- 2026-11-07: Step 5 (shops and prices from data) built: `data/shops.js` holds `SHOPS`, one generic
  `buyItem(shopId, itemId, qty)` replaces `buyWeapon`, the Shop tab draws `shopList()`, and the 8
  starter missiles are the missile module's `ammo`. The owner also asked for the six standard parts
  to go on sale at 1 cr each, so the Shop gained six rows (the beam and missiles are unchanged).
  Limited stock (`max`) works and `setShopStock()` is ready for restock timers later; nothing is
  saved, so save version stays 12. 131 tests green. Compared with the previous commit by a 19-step
  scripted outpost session: identical credits, stocks, holds, loadouts and messages, and six of the
  seven tabs render byte-identical HTML.
- 2026-11-08: Steps 4 and 5 ticked: the owner played the Inventory tab and the Shop (including
  section 8's old-save load) and confirmed both. Milestone A is reached and the docs say so.
- 2026-11-08: **Step 7d ticked.** The owner reported the registry cleanup playtest passed.
  The next planned work is step 8; save version remains 12.
- 2026-11-08: **Step 7c and step 7 ticked.** The owner playtested 7c and reported it passed.
  Player view and named mounts are in place; the sim has no render imports. Next: step 8.
- 2026-11-08: **Step 7b ticked.** Bullets, missiles, crates and particles are records (`sim/entity.js`,
  `sim/missile.js`), and so are rocks and the player's own ship (`sim/pilot.js`) — the rules already
  read both, so they came a slice early. `render/views.js` draws all of them. An old-vs-new probe ran
  a seeded session through both builds and found **no difference** in flight, shooting, hits, loot,
  mining, lock-on or clearing, apart from the deliberate fix that bolts no longer leave from last
  frame's gun position (the stale `matrixWorld`). Two porting bugs were caught and fixed: mining must
  shrink the rock's data, and a rock's shape must be rolled before its position. The owner asked for
  the slice to be ticked and closed, so **7b is complete**; 182 tests green, save version 12. Next
  is **7c**.
- 2026-11-08: **Step 7a ticked.** The owner played the build: the raiders behave as usual and they
  clear when the field is cleared on docking, so the slice is closed. (The clearing is not new —
  `dock()` has always called `clearTransient()`, and it deliberately does not count as a kill.)
  Next is **7b**: bullets, missiles, crates and particles. 165 tests green, save version 12.
- 2026-11-08: Step **7a** built (hostiles become data, the mesh becomes a view). An enemy used to
  *be* a three.js mesh (`{ m, hp, ... }`); it is now a record `{ id, kind: "enemy", def, pos, quat,
  hp, ... }` in `src/sim/enemy.js`, and `src/render/views.js` builds a mesh per hostile, copies its
  position and rotation onto it every frame, and removes it when the enemy leaves the world
  (`enemy-spawned` / `enemy-removed`). **No `src/sim/` file touches an enemy's mesh any more**, and
  the `render/` allow-list lost `ai.js` and `targeting.js`. The station's position moved from
  `render/scene.js` to `sim/world.js` (the sim needed it and may not import render/). New headless
  test: one raider, 600 ticks, no browser, checks it closed in, turned and shot. New view test: the
  mesh follows the data and goes away with it. An old-vs-new probe ran one scripted fight through
  the previous commit and this tree: **2545 of 2545 frames identical** (the only new thing is each
  enemy's `id`). Save version unchanged (12). 165 tests green. Waiting for the owner's playtest.
- 2026-11-08: **Step 6 ticked in full.** The owner played the 6b build and found no problems with
  the controls, so `testing/TESTING-BASELINE.md` sections A (flight feel) and B (mining, guns, missiles) are
  signed off and the step is closed: the sim imports no `core/` file, plays no sound and reads no
  key. 155 tests green, save version still 12. Next is step 7 (entities as data, meshes as views).
- 2026-11-08: Step **6b** built: the sim reads a control record (`state.controls`, shape in
  `src/state/controls.js`) instead of the keyboard, and the missile lock ring's pixel size moved
  from `sim/weapons.js` to `ui/hud.js` (the sim now reports the cone in degrees). **No `sim/` file
  imports `core/` any more**, so step 6's goal is met. A probe ran one scripted session through the
  previous commit (driven by `keys`) and this tree (driven by `state.controls`): **1010 of 1010
  frames identical**. The ring maths matches the old formula to the last digit at five angles.
  Save version unchanged (12). 155 tests green. Waiting for the owner's playtest before ticking.
- 2026-11-08: Step **6a ticked.** The owner played the build and confirmed the sounds by ear (all
  eleven, unchanged), so the sound half of step 6 is closed. Same day, the owner also caught a wrong
  claim in the 6a changelog entry: mining with a full hold is not possible, because `updatePrimary`
  says "Cargo hold full" and returns before the beam cuts. The docs were corrected; the code was
  already right.
- 2026-11-08: Step **6a** (the sim stops playing sounds itself) built: the sim emits
  `sfx { name, ...rest }`, `core/audio.js` owns an `SFX` table and one listener, and **no `sim/`
  file imports `core/audio.js` any more**. A new `tests/layers.test.mjs` (9 tests) enforces the
  layer rules and keeps the shrinking `render/` and `input.js` allow-lists honest. An old-vs-new
  probe recorded every Web Audio call in one scripted session through both trees: **671 lines
  identical**, all eleven sounds covered. Save version unchanged (12). 150 tests green.
  Not ticked yet: the owner plays the by-ear table in `testing/TESTING-BASELINE.md`.
- 2026-11-07: Shop fix after the owner's look at the step 5 build: the "Autocannons — Owned" line is
  gone, so the Shop lists the cannons once, as **Basic cannons** (`src/data/shops.js` lost its `kit`
  list, the screen stopped drawing it). There is one cannon module today; more will be stock rows
  when they exist. Nothing else about buying changed.

- 2026-11-08: Step 10 built and **ticked** (place definitions: systems and pockets; per-pilot
  place/warp; save v14 `world.place`; Meridian Station label). The owner played `testing/passed/TESTING-PLACES.md`,
  found three bugs (dead sound after an away resume, the start screen reappearing on dock, and
  Load/Import/Reset not redrawing), all fixed and confirmed working. 247 tests green, build succeeded.
- 2026-11-08: Follow-up feature (owner request): **come back where you logged out**. Save v15 adds
  `world.resume` (exact spot, heading, shields, boost; null while docked), with the pocket arrival
  point kept as the fallback, plus autosave on tab hide/close and every 15 s. 260 tests green.
- 2026-11-08: Autosave interval raised **15 s -> 30 s** at the owner's request, to keep the number of
  save writes down. One line in `src/data/simulation.js`; the save-on-close/hide behaviour is
  unchanged, so a normal quit still loses nothing. 260 tests green.
- 2026-11-08: **Step 11A built** (organic starmap generation and travel rules). `data/galaxy.js`,
  `sim/galaxy.js`, `sim/travel.js` and explicit `PLACE_LINKS` in `data/places.js`; 19 new tests cover
  determinism, 121 systems, organic scatter, reachability, one-peer gates, move/delete/promote
  overrides, generator replacement, visibility policy and distance-tier guidance. No live UI or save
  change: M still cycles the current system's pockets and save stays v15. 279 tests green; build
  succeeded. Next: **11B** starmap screen, pocket chooser and save v16.
- 2026-11-08: **Step 11A owner playtest passed.** No bugs were reported. Step 11 remains unticked
  until 11B is built and playtested. Packaged the full project as a backup, including source, tests,
  docs and the built HTML; dependencies/Git internals and browser-local saves are not included.
- 2026-11-08: **Step 11B built** (clickable M starmap, pocket chooser, direct-hop warp, save v16).
  `ui/starmap.js`, `sim/galaxy-session.js`, live place catalog, compact seed/knowledge saves,
  removed-pocket recovery, map/input pause and release, and 21 new tests. `npm test` **300/300**;
  build succeeded (650 KB). Root `testing/passed/TESTING-STARMAP.md` and old-code section C added. Step 11 stays
  unticked until the owner playtest passes. Next after that: **step 12** questions and slice plan.
- 2026-11-08: **Step 11B starmap UI follow-up built** (owner: "the map looks ok", then four changes).
  Zooming into a system dot opens a derived pocket map with internal lines and gate exit stubs toward
  neighbouring systems; right-click a legal pocket for **Warp to**; the right panel is a compact
  system/current-pocket/pocket-row overview with no warp buttons or scrolling. Save v16 unchanged
  (layout is derived, not saved). `npm test` **304/304**; build succeeded (662 KB). Step 11 still
  awaits the owner's `testing/passed/TESTING-STARMAP.md` pass.
- 2026-11-08: **Step 11B system-map follow-up built** (owner's three changes). Open-world systems now
  allow free warp to any local pocket; only their sub-system charts omit internal blue lines, while the
  galaxy keeps explicit gate routes. A per-system `intraSystem: "links"` opt-out is ready for future
  route-only instances. Pockets orbit a seeded visual-only star (95%) / black hole (5%); the core keeps a
  permanent proper-name/type label and cannot be warped to. Gate peers, compact name-only rows, warp
  rechecks and save v16 are unchanged. `npm test` **310/310**; build succeeded (666 KB). Step 11 still
  awaits the owner's `testing/passed/TESTING-STARMAP.md` pass.
- 2026-11-08: **Step 11B starmap refinements built** (owner's six changes). Removed native hover tooltips
  from pockets/central bodies while keeping click popups; core labels are permanent two-line name/type
  labels. Galaxy pan keeps the previous max-zoom feel and pans farther on screen when zoomed out; system
  cores scale with zoom. Gate pocket names avoid orange stubs/peer labels, and neighbouring-system labels
  open the same reachability/warp popup for the reciprocal gate pocket. `npm test` **312/312**; build
  succeeded (669 KB). Save v16 and travel rechecks unchanged; owner playtest still pending.
