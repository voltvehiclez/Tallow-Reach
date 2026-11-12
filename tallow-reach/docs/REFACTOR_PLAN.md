# Refactor plan: getting the code ready for the big game

> **Who reads what.** The **owner** (who does not code) follows "How to run a step". The **AI**
> (any model) follows "Rules for the AI" and the step it was given. Status of each step is tracked
> in [ROADMAP.md](ROADMAP.md). The destination is [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md);
> the game being built is [VISION.md](VISION.md).

A refactor step **changes how the code is organised, not how the game plays.** After each step the
game should look and feel identical, only now it can grow. That is what makes it safe to do with
an AI: you can prove nothing broke.

There are **15 steps in 4 milestones**. Do them **in order**, one step (sometimes one slice of a step)
per chat.

| Milestone | After steps | What it unlocks |
| --- | --- | --- |
| **A. Content-ready** | 1 to 5 | New enemies, items, loot, modules, ships and shop stock are **data-only** additions. You can start adding content here. |
| **B. Multiplayer-shaped** | 6 to 9 | The game logic runs without a screen, entities are plain data, there is a list of players, the save is split. Co-op becomes possible later. |
| **C. World-ready** | 10 to 12 | Sectors are data, a generated 100+ sector starmap, encounters and sector memory. The open world can scale. |
| **D. Story-ready** | 13 to 15 | A mission framework, wormhole instances and the campaign scaffolding. |

Multiplayer itself is **step 16**, planned when you get there (outline at the bottom).

---

## How to run a step (for the owner)

**Once, before step 1**
1. Run `npm test` and play [TESTING-BASELINE.md](../TESTING-BASELINE.md) once. If anything is
   already broken, tell the AI at the start of step 1 (it is also worth fixing first).
2. Make a backup: zip the whole project folder and name it with today's date.
   Even better: put the folder in git (GitHub Desktop makes this point-and-click) so every step is one
   commit you can undo. Not required, but it is the best safety net there is.

**For every step**
1. Open a **new chat** with any AI. Attach the latest project zip. (If the AI cannot read zips,
   paste the files it asks for, starting with the docs listed in the starter prompt.)
2. Paste the **starter prompt** from [AI_PROMPTS.md](AI_PROMPTS.md), then the **step prompt**:

   ```
   Do refactor step <N> ("<title>") from docs/REFACTOR_PLAN.md.
   First read docs/VISION.md, docs/TARGET_ARCHITECTURE.md, docs/ROADMAP.md and the step itself.
   This is a refactor: the game must play exactly the same afterwards.
   Plan first, in plain language: what changes, whether to split it into slices that can each be
   played, and which of my open questions in VISION.md you need answered. Then wait for my OK.
   ```
3. Read the AI's plan. If it is too big, say **"split it into smaller slices"**: that is always
   allowed and usually wise. Answer its questions. Reply "go".
4. The AI gives you files. Copy them into your project, replacing the files with the same path.
5. Run `npm run build` and `npm test`. Then play [TESTING-BASELINE.md](../TESTING-BASELINE.md)
   **and** the step's own checks (the AI writes them for you). Also load an **old save** to check
   old saves still work.
6. **If it all passes:** zip the project as the new baseline (dated). Ask the AI: *"Rewrite
   docs/HANDOFF.md and tick the step in docs/ROADMAP.md"* if it has not already. Done.
7. **If something fails:** send the AI the exact error or what you saw, in the same chat. If two
   rounds do not fix it, **restore your backup** and start the step again in a fresh chat, telling
   it what went wrong last time. Never carry on to the next step on top of a broken one.

**Switching AIs between steps is fine.** The docs are the memory. Just always attach the *latest*
zip and never have two chats editing the project at once.

**Good to know**
- Some steps are big. Steps 6, 7 and 8 are the heaviest: expect several chats each. That is normal.
- You never need to understand the code. You need to run the two commands and click through the
  checklist.
- You can add content between steps once Milestone A is done (see ROADMAP.md).

---

## Rules for the AI (every refactor step)

1. **Read first:** VISION, TARGET_ARCHITECTURE, ROADMAP, this step, then the files it touches.
2. **Behaviour must not change.** The standing ground rules still apply ([HANDOFF.md](HANDOFF.md)):
   `FLIGHT` and `CAMERA` are settled, hulls identical apart from the hold, etc. The only exceptions
   are changes this step explicitly lists.
3. **The owner has approved the restructuring in this plan.** The old rule "keep the existing
   structure" is read as: *keep the folders and conventions; make the changes listed in the step.*
   Do not rename, move or reformat anything the step does not need.
4. **Plan first, then wait for the owner's OK.** Say plainly what will change. If the step is big,
   propose slices that can each be built, tested and played on their own, and do **one slice**.
5. **Ask, don't guess, on design questions.** If the step touches an open question in VISION.md
   and the owner has not decided it, use the *default* there, say so, and record it.
6. **Prove it with tests.** Keep all existing tests green; add tests for what you build. Where a
   step lists a "layer test" or content test, it is required. If you cannot run the tests or the
   build (no network is common), say so plainly and tell the owner exactly what to run.
7. **Saves:** change the save only where the step says so. Bump `SAVE_VERSION`, write a migration,
   and add a test that loads an old-shaped save. Never change storage keys.
8. **Update the docs in the same change:** `CHANGELOG.md` entry, `ARCHITECTURE.md` (rewrite the
   rule that changed, do not append a second one), `TARGET_ARCHITECTURE.md` (delete the closed debt
   row), folder `README.md`s, `HOW_TO_ADD.md` (recipes that changed), `ROADMAP.md` (tick the step),
   a `TESTING-*.md` for anything the owner will click, and `HANDOFF.md` if the chat is ending.
9. **Deliver complete files** with full paths (or a zip), never fragments, and end with the
   build/test reminder and plain-language test steps.
10. **No new npm dependencies** (until step 16 says otherwise).

---

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

## Step 12: Encounters, place templates and place memory
**Goal.** The open world's content is data you can pile onto.
**Do.** `data/encounters.js` and `data/place-templates.js`. Ship at least **three templates** and
**four encounter kinds** as proof (for example a hostile patrol, a friendly trader using `SHOPS`, a
derelict with loot, a resource cache). Templates pull encounters by tier. A generic spawner replaces
the raider special cases in `sim/ai.js` (hunt-contract behaviour stays the same). Places remember
what you did (mined-out rocks, cleared encounters) with slow simulation-time respawn timers and event overrides (owner decision recorded in VISION.md). Every dockable station also resolves a stable `${placeId}:${featureId}` storage key; trader stations reuse Meridian's `SHOPS` definitions but never share stock.
**Done when.** Adding an encounter is a data entry; the content test checks every reference; flying
into a few generated pockets shows different things and station-local inventory survives switching and reload.
**Save.** **Version 18**, migration from 17 (the destination follow-up used v17); station-local stores are an optional v18 extension so Step 13 remains v19.
**Status:** [ ] **Built 2026-11-10; owner playtest pending (`TESTING-12-PLACES.md`).**

> **Milestone C reached.** The open world can scale to 100+ systems of pocket content.

---

# Milestone D: Story-ready

## Step 13: Mission framework (contracts and long story missions, one system)
**Goal.** One system runs both short open-world contracts and long, scripted, dialogue-heavy campaign
missions. It must be designed for the long kind from the start; contracts are just the simplest use.
**Ask the owner first:** "Will the story have choices that change later missions (for example who you
side with)?" If unsure, answer "maybe": the framework will support remembered flags and simple
choices in dialogue, and you can ignore them.
**Do.** Build it in three slices, each playable.
- **13a, runner and objectives.** `data/missions/` and `sim/missions.js`. A mission is data:
  `{ id, title, kind: "contract" | "story", requires, steps, rewards, fails }`. A runner advances the
  current step by listening to events. Objective steps to start: kill (enemy def or faction, count),
  mine, collect, reach a sector, deliver, survive. **Rebuild today's three contract types on it with
  identical wording, rewards and behaviour.** Several missions can be active at once.
- **13b, the steps a story needs.** Add step kinds that contracts never use: **dialogue** (speaker, lines,
  optional choices), **script** actions (spawn a wave or a ship in a sector feature, set a sector
  state, give or take an item, play a sound, warp the player), **wait** (for a trigger, a timer or the
  player entering an area), **flags** (set, test, and branch on remembered facts), and **parallel**
  (do these objectives in any order). A mission can fail (ship lost, left the sector, timer ran out)
  and says what happens when it does.
- **13c, the screens.** A **dialogue panel** (portrait slot, speaker, text, choices; it pauses
  nothing in the world unless the mission says so) and a **mission log** tab (active missions, current
  step, what to do next).
**Data rules.** All story text lives in the mission data, not in code. A mission file never imports
engine code; it only names things by id (enemies, items, sectors, flags).
**Done when.**
- Contracts play exactly as before.
- A test mission of about ten mixed steps (dialogue with a choice, a spawned wave, a kill objective,
  a flag check, a reach-sector objective, a reward) is completed in a headless test by firing events,
  and the choice changes which step comes next.
- The content test checks every mission: each id it names exists, every step is reachable, and the
  mission can be completed.
- A mission survives save and load in the middle of a step; abandoning or dying mid-mission does what
  the mission's `fails` says.
**Save.** **Version 19**: `mission` becomes `missions` (progress per active mission: current step,
counters) plus `flags`, with migration.
**Status:** [~] **13a/13b/13c built 2026-11-10; owner browser playtests pending (`TESTING-13-MISSIONS.md` and `TESTING-13C-SCREENS.md`).**
13b headless coverage is in `tests/step13b-missions.test.mjs`; 13c UI coverage is in `tests/step13c-ui.test.mjs`. The step remains unticked until the owner plays the screens.

## Step 14: Instanced sectors and wormholes
**Goal.** Temporary, generated, harder sectors reached through wormholes.
**Ask the owner first:** open question 5.
**Do.** `sim/instances.js` (`createInstance(template, seed, tier)`), a wormhole item and entity, rules
for entering and leaving, a difficulty scalar well above the map's, at least two instance templates.
Instances are not saved; leaving or dying discards them (death rules unchanged).
**Done when.** You can spawn a wormhole, enter a generated instance, fight, loot, leave with the loot;
the same seed gives the same instance (tested).
**Save.** Only if wormhole items need it (item registry already covers it).

## Step 15: Campaign scaffolding
**Goal.** The campaign can be *written*, one data file per mission.
**Ask the owner first:** open question 8.
**Do.** `data/campaign/` with `index.js` (the order) and `m01.js` as a worked example (and an
`m02.js` stub); game mode `campaign` versus `free agent` in the profile; a new game starts in the
campaign; scripted sectors use the step 10 loader; a mission-select screen; replay of completed
missions in any order for a modest reward; finishing all missions flips the player to free agent and
releases the open world; a simple brief/dialogue panel for text.
**Done when.** A test completes a stub campaign and checks the transition and the replay rewards.
Adding a mission is one new file and one line in `index.js`.
**Save.** **Version 20**, migration from 19.

> **Milestone D reached.** Write the campaign.

---

# Step 16: Multiplayer (planned when you get there)

Do not start until steps 6 to 9 are done. The first chat for this step should **write its own plan**
into this file before any code. Expected shape:
1. **Pick the transport** and decide whether to relax the no-dependency rule (browser WebRTC
   needs a small signalling service). Build a tiny spike: two browser tabs exchanging a message.
2. **Host streams snapshots** of nearby entities to one guest; guest draws them.
3. **Guest controls:** the guest's `controls` drive their ship on the host.
4. **Join link:** host copies a URL; opening it joins.
5. **Guest profile in and out** using `portableProfile`/`mergeProfile` from step 9.
6. **Trading** between two players.
7. **Polish:** more than two players, disconnects, no-pause rule, latency smoothing.

---

## If a step goes wrong
- Restore your backup. Start the step again in a new chat; paste what failed.
- If the AI says a step is too big, accept the slices. A tiny step that works beats a huge one that doesn't.
- If an AI proposes changing this plan, it must say why and update this file, ROADMAP.md and
  TARGET_ARCHITECTURE.md itself, with your OK.
