# Tallow Reach: roadmap and status

> **The living plan.** Where we are, what is next, what is waiting. Any AI that finishes a step
> **ticks it here** (and adds the date). The game being built is in [VISION.md](VISION.md); how the
> code must change is in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md); the detail of every step
> and its prompt is in [REFACTOR_PLAN.md](REFACTOR_PLAN.md); the current state of the game is in
> [HANDOFF.md](HANDOFF.md).

**Current position:** **Milestone A is done, step 6 is done, and step 7b is ticked** (2026-11-08):
an enemy, a bullet, a missile, a crate, an explosion spark, a rock and the player's own ship are all
plain data now, and `render/views.js` draws every one of them. **No `src/sim/` file holds a mesh**,
which is what step 7 set out to do; two `render/` imports remain (`sectors.js` for the scenery
groups, `weapons.js` for the lock cone) and step 7c closes them. An old-vs-new probe proved the game
plays identically. 182 tests green, save version still 12. **Step 7c is next**, then step 8 (a fixed
time step and a list of players).

**Already ticked:** steps 0 to 5 (steps 4 and 5 on 2026-11-08, after the owner played
`TESTING-INVENTORY.md` and `TESTING-SHOPS.md`): the item catalogue with one inventory per place
(save v12), and shops and prices from data. **Step 6, ticked in full (2026-11-08):** 6a, the sim
no longer plays sounds (it emits `sfx`, `core/audio.js` plays them; the owner confirmed every sound
by ear) and 6b, the sim reads `state.controls` instead of the keyboard and the mouse and the missile
lock ring is sized in `ui/hud.js` (the owner played `TESTING-BASELINE.md` sections A and B and found
no problems). So **no `src/sim/` file imports `core/` at all**. The owner's earlier answers stand:
found modules do **not** get random stats, so a stock stays a plain count per item; Meridian sells
the six standard parts for 1 cr each (beam 900, missile pod 1500); shop stock can be limited (`max`)
but no row uses it yet, and `setShopStock()` is still the unused restock hook. Data-only content
(rows 1 to 8 of "Content you can add now") can go ahead in parallel.

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
| 0 | Backup, `npm test`, play TESTING-BASELINE.md once | start | [x] 2026-11-07 |
| 1 | Enemy registry (`data/enemies.js`, `enemy-killed` event) | A | [x] 2026-11-07 |
| 2 | Seeded randomness everywhere | A | [x] 2026-11-07 |
| 3 | Loot tables | A | [x] 2026-11-07 |
| 4 | Item registry and generic inventory (save v12) | A | [x] 2026-11-08 |
| 5 | Shops and prices from data | A | [x] 2026-11-08 |
| 6 | Sim stops using sound and keyboard | B | [x] 2026-11-08 |
| 7 | Entities are data, meshes are views (7a enemies, 7b everything else in the world, 7c the hull's own view class) | B | [ ] **7a and 7b ticked 2026-11-08. 7c to do** |
| 8 | Fixed time step and a list of players | B | [ ] |
| 9 | Split the save: profile and world (save v13) | B | [ ] |
| 10 | Sector definitions, current sector saved (save v14) | C | [ ] |
| 11 | Galaxy (100+ sectors) and starmap screen (save v15) | C | [ ] |
| 12 | Encounters, sector templates, sector memory (save v16) | C | [ ] |
| 13 | Mission framework; contracts rebuilt on it (save v17) | D | [ ] |
| 14 | Instanced sectors and wormholes | D | [ ] |
| 15 | Campaign scaffolding (save v18) | D | [ ] |
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

- **Sector templates** (asteroid belt, derelict graveyard, pirate den, nebula, trade lane, ...).
- **Encounters** (patrols, ambushes, traders, distress calls, caches, hazards).
- **Hand-made special sectors** (a hub, a boss sector).
- **Wormhole instance templates** (the hard, high-reward content).

## Campaign (after Milestone D)

- At least 10 missions, one file each in `src/data/campaign/`, ordered by `index.js`.
- Start: new game begins in the campaign. End: player becomes a free agent in the open world.
- Replay any completed mission in any order for modest rewards that carry over.
- The AI writing the campaign needs story notes from the owner (add them to VISION.md or a
  `docs/STORY.md`, not into chat only).

## Parking lot (not scheduled; from earlier notes)

- Warp: should enemies keep shooting during the charge, or does a warp grant invulnerability?
  (design decision, undecided).
- Salvage crates are abandoned when you warp out. (Will be handled by sector memory in step 12.)
- Mute state is not saved.
- Inventory is still "untested in the real game" per HANDOFF.md until the owner has played it.

## Log

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
- 2026-11-08: **Step 7b ticked.** Bullets, missiles, crates and particles are records (`sim/entity.js`,
  `sim/missile.js`), and so are rocks and the player's own ship (`sim/pilot.js`) — the rules already
  read both, so they came a slice early. `render/views.js` draws all of them. An old-vs-new probe ran
  a seeded session through both builds and found **no difference** in flight, shooting, hits, loot,
  mining, lock-on or clearing, apart from the deliberate fix that bolts no longer leave from last
  frame's gun position (the stale `matrixWorld`). Two porting bugs were caught and fixed: mining must
  shrink the rock's data, and a rock's shape must be rolled before its position. 182 tests green,
  save version 12. Next is **7c**.
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
  the controls, so `TESTING-BASELINE.md` sections A (flight feel) and B (mining, guns, missiles) are
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
  Not ticked yet: the owner plays the by-ear table in `TESTING-BASELINE.md`.
- 2026-11-07: Shop fix after the owner's look at the step 5 build: the "Autocannons — Owned" line is
  gone, so the Shop lists the cannons once, as **Basic cannons** (`src/data/shops.js` lost its `kit`
  list, the screen stopped drawing it). There is one cannon module today; more will be stock rows
  when they exist. Nothing else about buying changed.
