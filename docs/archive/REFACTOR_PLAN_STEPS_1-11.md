# Archived refactor plan: steps 1 to 11 (completed)

> Moved word for word out of [REFACTOR_PLAN.md](../REFACTOR_PLAN.md). These steps are done and playtested; read only for history.

# Milestone A: Content-ready

## Step 1: Enemy registry
**Goal.** Enemies are data. A second enemy type must be addable without touching code.
**Do.**
- Create `src/data/enemies.js` with `ENEMIES`. First entry is today's Newbie Raider with exactly
  today's numbers (name, Hull HP, scale, colour, speeds, fire range and rate, damage, spawn
  distances currently scattered as constants at the top of `sim/ai.js`).
- Replace `spawnPirate()` with `spawnEnemy(defId, pos)`. Behaviour is chosen by the def's `ai` field
  (one behaviour exists today: close in, then circle and shoot).
- Give every enemy a `faction` (start with `pirates`; add `data/factions.js` with just that entry).
- Change the event `pirate-killed` to `enemy-killed { def, faction }` and update `sim/contracts.js`
  and the event list in `util/events.js`. (Hunt contracts still count raiders only.)
**Done when.** The game plays the same. `tests/content.test.mjs` checks every enemy def is complete.
A test adds a fake second enemy to `ENEMIES` and spawns it with no code change.
**Save.** None.

## Step 2: Seeded randomness everywhere
**Goal.** Same seed, same result. Needed for generated sectors, wormholes and co-op.
**Do.**
- Replace every `Math.random()` in `src/sim/` (today: `ai.js`, `combat.js`, `asteroids.js`) with
  `random()` from `util/rng.js`.
- Add `makeRng(seed)` to `util/rng.js`: an independent generator, so generating a sector never
  depends on how many dice combat rolled earlier.
- Add a test that fails if `Math.random` appears anywhere in `src/sim/` or `src/data/`.
**Done when.** Unseeded play is unchanged; with `setSeed(1)` two runs of the same spawn logic
agree (tested).
**Save.** None.

## Step 3: Loot tables
**Goal.** What drops, and what an asteroid is made of, is data.
**Do.**
- Create `src/data/loot.js` (`LOOT_TABLES`: weighted entries with item id and count range) and a pure
  `sim/loot.js` (`rollLoot(tableId, rng)`), tested.
- An enemy def points at a loot table. Reproduce today's odds exactly: one or two salvage crates
  (50/50) and a 10% reactor-core crate. The asteroid ore mix (`sim/asteroids.js`) moves into a table too.
**Done when.** Same drops as before (statistically); a test rolls each table 10,000 times and checks
the odds. Adding a drop is a data edit.
**Save.** None.

## Step 4: Item registry and a generic inventory (the "inventory redo")
**Goal.** Any number of item types, in categories, in one inventory. No fixed list of ores.
**Ask the owner one question first:** "Should modules you *find* ever have random stats (rare
versions, bonuses)?" If unsure, answer "not yet": the format will leave room for it.
**Do.**
- `ITEMS` in `data/items.js` gets a category (`ore`, `salvage`, `module`, `ammo`, `consumable`,
  `trade`...), a volume and a stack rule. Modules become items in the same registry (still linked to
  `MODULES` by id).
- Stores and holds become `id -> quantity` (stacks may carry optional extra data for later rolled
  items). Remove `emptyCargo()` and `KEYS` as fixed lists; `profile.modules` and cargo merge into one
  inventory per place. `sim/inventory.js`, `fitting.js`, `economy.js`, `asteroids.js`, `combat.js`
  and the Inventory/Shop screens read the registry.
- The Inventory tab looks and behaves exactly as today.
**Done when.** `TESTING-INVENTORY.md` still passes; adding a new item is a data edit; tests load a
v11 save and convert it.
**Save.** **Version 12**, with migration from 11.

## Step 5: Shops and prices from data
**Goal.** What a shop sells is data, so every future trader and station can reuse it.
**Do.**
- Create `src/data/shops.js` (`SHOPS`): per shop, a list of item ids with price and stock rule.
  Meridian's shop is the first entry and sells exactly what it sells today.
- One generic `buyItem(shopId, itemId, qty)` in `sim/economy.js` replaces `buyWeapon` and the
  hard-coded `SHOP_WEAPONS` (the 8 starter missiles become a property of the missile item). The Shop
  tab draws from `SHOPS`. This completes recipe 17 in `HOW_TO_ADD.md`.
**Done when.** The Shop behaves as today; adding an item to Meridian's shop is one data line.
**Save.** None.

> **Milestone A reached.** You can now add enemies, loot, items, modules and ships as data. Start
> adding content (see ROADMAP.md "Content you can add now") while the next steps continue.

---

# Milestone B: Multiplayer-shaped

> These steps are invisible in play and the riskiest. Do them **before** the world gets large.
> Every slice must end with the game playing as before.

## Step 6: The sim stops using sound and the keyboard
**Goal.** `src/sim/` no longer imports `core/`.
**Do.** Slice **6a, sound:** the sim emits events (for example `sfx { name, ... }`); `core/audio.js`
subscribes and plays the tones. **6b, input:** `core/input.js` writes a `controls` object (thrust,
steer, roll, fire, secondary, boost, brake...) into `state`; `sim/player.js`, `sim/weapons.js` and
`sim/sectors.js` read `controls`, not `keys`/`pointer`. Anything that needs the camera or the screen
(for example the lock-on ring in pixels) moves to `ui/` or `render/`, or becomes angle maths in the sim.
**Done when.** A new test `tests/layers.test.mjs` reads every file in `src/sim/` and fails if it
imports from `core/`, `ui/` or (for now, with an allow-list that shrinks in step 7) `render/`.
Everything plays as before.
**Save.** None.

## Step 7: Entities become data; meshes become views
**Goal.** `src/sim/` no longer holds any three.js object. This is the big one.
**Do.** Slice **7a (ticked 2026-11-08):** enemies as `{ id, kind, def, pos, vel, quat, hp... }`, with
`render/views.js` creating, updating and removing their meshes by watching the entity lists. **7b
(ticked 2026-11-08):** bullets, missiles, crates and particles as records (`sim/entity.js`,
`sim/missile.js`), and — pulled forward because the rules already read them — rocks and the player's
own ship (`sim/pilot.js`). **7c (ticked 2026-11-08):** the player hull has its own view class with named mount points
(the gun muzzles and the missile rail); `sectors.js` and `weapons.js` no longer import `render/`.
The owner playtested 7c and reported it passed.
Each slice is playable on its own. Positions are plain `{x,y,z}` data (or keep three.js
vectors/quaternions as maths types, which is fine; just no meshes, scenes or materials in `sim/`).
**Done when.** The `render/` allow-list in the layer test is empty. A new **headless sim test**
builds a world, spawns an enemy, steps 600 ticks with no browser and checks the enemy approached and
shot. The game plays as before. Mount points to be data-driven and named, so a model can supply them later.
**Save.** None.

## Step 7d: Entity view registry (ticked 2026-11-08)
**Goal.** Make new entity views extensible without changing existing view machinery.
**Do.** Replace the two entity-kind switches and separate enemy mesh map in `render/views.js`
with one registry of kind-specific list, build, update and removal handlers and one live-view map.
Keep the player hull view and beam separate. Preserve events, frame reconciliation and disposal.
**Done when.** Existing views behave as before; a test registers a fake kind and proves its mesh
appears, updates and disappears without editing existing kinds. Tests and build pass. The owner
reported the playtest passed.
**Save.** None.

## Step 8: Fixed time step and a list of players
**Goal.** The sim steps at a fixed rate; flight, drive, power, shield, hull damage, weapons, missiles, targeting and enemy AI act on individual players. Inventory, economy, docking, contracts, death/recovery and saves remain local-only until step 9.
**Do.** `sim/step.js` exposes `stepSim(dt)`; `main.js` feeds it fixed steps (for example 1/60 s)
from an accumulator. `state.player` becomes an entry in `state.players` with its own `controls`;
`localPlayer()` is the one the screen follows. Systems take the player they act on. The flight feel
is **settled** and must be identical: add a test comparing the position after N simulated seconds
at the old variable step and the new fixed step.
**Done when.** Single-player plays identically at 30, 60 and 144 fps (check with the browser's frame
rate throttle if you can). Tests green.
**Owner-approved slices** (each gets tests; 8c is playtested only after all its sub-slices are done; no networking):
- **8a — fixed simulation tick.** Move the gameplay updates to `sim/step.js`, feed them from a
  fixed-step accumulator, preserve pause and the existing long-frame cap, and compare flight with
  the old loop. **Ticked 2026-11-08:** the owner reports the playtest passed
  (`TESTING-BASELINE.md` section J). The 60 fps flight test matches the old loop; other old frame rates have measured differences.
- **8b — player records and controls.** Introduce `state.players`, `localPlayer()` and an
  independent control record for each player. Keep the existing single-player experience and
  add tests showing that player records and controls are independent. **Ticked 2026-11-08:**
  the owner reported the playtest passed (`TESTING-BASELINE.md` section K). Temporary local-player
  compatibility aliases remain
  for systems to migrate in 8c.
- **8c — player-aware simulation.** Flight, drive, power, shields, hull damage, weapons,
  missiles and targeting use the passed player's independent runtime. `stepSim` advances each
  active pilot and shared projectiles/world once; enemies pursue the nearest active player.
  **Ticked 2026-11-08:** implementation and automated checks complete; the owner reports the
  playtest passed (section L of `TESTING-BASELINE.md`), including smooth play on a 240 Hz display
  with no view interpolation needed. Two-player headless tests and scripted 8b flight and
  combat/lifecycle comparisons pass. Remaining local-only areas are assigned in
  `TARGET_ARCHITECTURE.md` across steps 9, 10 and 16; camera-sampled missile aim remains parked
  in `ROADMAP.md`, while the old wall-clock asteroid respawn caveat was closed by Step 12 place memory.
**Save.** None.

## Step 9: Split the save into profile and world
**Goal.** Portable character data apart from per-world data (TARGET_ARCHITECTURE principle 5), and close every step-9-owned item in the [still-local-only table](TARGET_ARCHITECTURE.md#still-local-only-after-step-8c-assigned-by-owner-step) (saves and profiles; inventory and pickups; economy, outfitting and saved ammunition; contracts and rewards; docking and launch). Warp and sector ownership belong to step 10; non-local death/recovery and player presentation/input belong to step 16.
**Do.** `profile` keeps credits, ships, loadouts, holds, hull damage, stats, active missions and
(later) campaign progress. `world` gets the station (base levels, store), the contract board and
placeholders for the galaxy and current sector. Same save slots and export code carry both.
`sanitizeProfile` is split into `sanitizeProfile` and `sanitizeWorld` and stops naming base modules
by hand (it walks `BASE_MODULES`). Add pure helpers `portableProfile(save)` and `mergeProfile(save, profile)`
(what a guest carries into a world and brings back), tested. Work in self-tested sub-slices:
9a (pure split functions and v12 -> v13 migration tested against real v12 saves, no UI),
9b (wire the game to `profile` and `world`), and 9c (`portableProfile` / `mergeProfile` and close
every step-9-owned local-only item). No networking.
**Done when.** Old saves and old export codes load; new ones round-trip; step-9 local-only items are closed; tests cover all of them.
**Save.** **Version 13**, migration from 12. **Status:** [x] **complete 2026-11-08 — owner playtest passed (225 tests green).**

> **Milestone B reached.** The core is ready for co-op later.

---

# Milestone C: World-ready

## Step 10: Place definitions (systems and pockets)
**Goal.** A flyable place's contents are data; no geography in code. The owner's 2026-11-08
decision replaces the old "two sectors" wording: the map level is a **system**, a flyable area is
a **pocket**, and you are always in a pocket. The starting system is **Meridian System**; its first
pockets are **Meridian Station** (internal id `reach`, station + asteroid belt, formerly Tallow
Reach) and **Kestrel Hollow** (internal id `hollow`, empty). A system may have any number of
pockets. Meridian is a station feature inside its pocket, not a child place. Generic nouns live in
`data/terms.js` (`mapNode: "system"`, `flyable: "pocket"`), each changeable in one line; the
in-game station label is **Meridian Station**.
**Do.** Describe the two pockets as place records `{ id, kind, def, parent, enter, leave }` pointing
at `PLACE_DEFS` features (station, asteroid field with position/radius/height/count/ore/respawn,
spawner rules, planet scenery, arrival point). One generic loader builds a place's entities and
scenery from its definition. Entities live in per-place runtime containers (replacing the `parked`
rock lists, `FIELD_CENTER`, `FIELD_SECTOR`, `STATION_POS` and `launch()` facing a hard-coded field).
Each pilot owns a current place and warp sequence; shared systems advance once per occupied place.
M keeps cycling the pockets of the current system exactly as today. The pocket you are in is
**saved** (`world.place`, replacing the `sector` placeholder). Loading a save made away from the
station resumes flying at that pocket's arrival point; a save made at the station opens the station
menu. Internal ids `reach`/`hollow` and old saves/export codes keep working.
**Owner-approved slices** (each tested before the next): 10a docs, terms, place registry, generic
loader and per-place containers (save stays 13); 10b per-pilot place/warp ownership and place-scoped
simulation (save stays 13); 10c save v14, migration, resume-on-load, checklist and final docs.
**Done when.** The two pockets look and play exactly as before apart from the approved names;
deleting `FIELD_CENTER` breaks nothing; a third pocket can be added as data and M cycles all of
them; reloading a save puts you back in the pocket you left; one pilot warping does not move
another pilot's place or clear their fight.
**Save.** **Version 14**, migration from 13 (`world.sector` -> `world.place`).
**Status:** [x] **complete 2026-11-08 — owner playtest passed (`TESTING-PLACES.md`); the three bugs it found were fixed and confirmed. 247 tests green, build succeeded.**

## Step 11: System map, pocket chooser and starmap
**Goal.** A generated **organic 2D web** of 100+ systems, a 2D starmap to travel between connected
pockets, and a proper way to choose among the pockets of the current system (M today only cycles them).
**Owner decisions (2026-11-08, recorded in VISION.md):** free warp to any pocket within an open-world
system by default, with a data `intraSystem: "links"` opt-out for future route-only instances; explicit
cross-system gate hops remain. Each system chart has a non-warpable star (95%) / black hole (5%) core,
named from the system with a permanent two-line name/type label; pockets orbit it and only route-only systems draw
internal lines. A gate pocket has exactly one external gate peer in a neighbouring system; each system
has an ordinary hub plus any detached station pockets and one gate pocket per neighbour; Meridian keeps
`reach`/`hollow` unchanged and gains separate new gate pockets. Generated gate trader stations are
moved to their own station pockets by default, while explicit author features/placement flags can
co-locate a station. The whole map is visible through a configurable policy; difficulty is distance guidance with seeded variation, while
actual content decides danger. The web must stay modular: move a system, delete a pocket, promote a
pocket to a gate, add a route or replace the generator without rewriting map/UI/warp code. Future fuel,
activated gates and supercruise are out of scope now.
**Owner-approved slices:**
- **11A — world generation and travel rules.** `data/galaxy.js` (seed, count, degree cap, visibility,
  tier and empty travel cost/requirements), `sim/galaxy.js` (`generateGalaxy(seed)`, generator registry,
  author overrides, validation) and `sim/travel.js` (pure direct-hop quotes/options/route search).
  `data/places.js` gains explicit `PLACE_LINKS`. Tests prove determinism, 100+ systems, organic scatter,
  reachability, dead ends/junctions, one-peer gates, move/delete/promote overrides, configurable
  visibility and distance-tier guidance. **No live UI or save change in this slice.**
- **11B — starmap, destination selection and saved worlds.** `ui/starmap.js` opened with **M** shows the
  system web and gate connections. Zooming into a selected system dot opens a derived **system pocket map**
  (pockets orbiting a named visual star/black hole; internal lines only for route-only systems, plus gate
  exit stubs toward neighbouring systems); a compact right panel lists the system name, current pocket and
  plain pocket rows. **Clicking/right-clicking a legal pocket or gate-neighbour label** offers
  **Warp to** and starts the existing warp sequence. Single-player map pauses the simulation; a future host
  keeps running. The initial save slice was v16; the destination follow-up made the final Step 11 save
  **v17**, storing the galaxy seed/knowledge and route destination, not generated geography or pocket layout,
  with migration from v15/v16 and a removed-pocket fallback to the safe home station without losing
  character/cargo. Map/input/save tests and root-level `TESTING-STARMAP.md`.
**Done when.** Tests prove generation is deterministic, has at least 100 systems, every system is
reachable, and difficulty generally rises with distance from Meridian while authored content may stay
easy. You can click through the map, zoom into any system's pocket map, click/right-click among any number
of pockets or gate-neighbour labels, and warp one hop at a time: freely within a default system, through
explicit gates between systems. A sparse radial-depth web makes outer reaches at least ten gate crossings away on the default seed;
chart-only dot positions are adjusted so straight lines avoid unrelated dots and route lists page only when space is insufficient.
A permanent two-line label names the non-warpable core; galaxy pan and
core graphics scale with zoom; a links opt-out restores internal routes/lines. Do not
assume a system has exactly two pockets, and do not hard-code a two-level universe.
**Save.** **Version 17**, migration from 16 (v15 is already used by the resume point).
**Status:** [x] **11A owner playtest passed 2026-11-08; 11B + zoom/right-click UI, free-local-warp/central-body and label/pan/gate-click refinements built and owner playtest passed. Save v17 persists destinations and system pocket maps show local route hops.**
