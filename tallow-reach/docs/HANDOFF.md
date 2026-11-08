# START HERE — handoff note for a fresh session

> Updated 2026-11-08. Save version **13**. **225 tests** in `tests/`, all green as of this update
> (run in the session that wrote it: `npm install`, `npm test` and `npm run build` all worked).
> `game/tallow-reach.html` is generated, and the user builds it
> on their own computer with `npm install` then `npm run build`. Inventory and shops, **step 8**
> (validated on a 240 Hz display) and **step 9** (save v13 profile/world split) are all
> **confirmed by the owner's playtests** (2026-11-08) — **Milestone B is complete**.
> This file replaces the memory of the previous chat. Read it, then **`docs/VISION.md`** (what the
> game is meant to become), **`docs/ROADMAP.md`** (what is done and next), `docs/ARCHITECTURE.md`
> (the code as it is), `docs/TARGET_ARCHITECTURE.md` (where it is heading), `docs/HOW_TO_ADD.md`
> and the top two entries of `docs/CHANGELOG.md`, and you are up to speed. Any AI model may be
> reading this: do not assume you are the one who wrote earlier changes.
> `docs/CHANGELOG.md` also has a one-line index of older entries; the full text of those is in
> `docs/CHANGELOG_ARCHIVE.md` (open it only when the index shows something relevant).

**Where the game is right now, in one paragraph.** Tallow Reach is a three.js space game played
from one built HTML file. You fly out of Meridian Outpost, take contracts, mine asteroids, fight
Newbie Raiders, and dock to spend the money. A ship is **modules in bays** on the Outfitting
screen: a powerplant (10 MJ/s), a power cell (100 MJ), thrusters (150 m/s and 69 deg/s on the
basic set, a 10-unit boost tank, 20 MJ ignition, boost doubles the drive), shields (10 Shield HP,
1 a second back after a 4-second lull), a **basic hull** (10 Hull HP), **basic cannons** (1 damage
a shot, 3 shots a second per barrel, two linked barrels, 2 MJ/s while firing), and two parts
bought in the Shop: the **basic mining beam** and the **basic missiles**. Everything that uses
power draws from one budget and refuses to run when the ship cannot pay. An empty bay means the
ship simply lacks that thing: no thrusters = cannot move, no shields = every hit reaches the
hull, no hull module = the first hit that reaches the hull destroys the ship. Hostiles are
**Newbie Raiders**: 10 Hull HP, no shields, 1 damage a shot. Everything a place holds — ore,
salvage and spare modules — is one **stock of items** (`{ itemId: count }`) from the catalogue in
`src/data/items.js`.

**The big picture, in five lines** (full text in `docs/VISION.md`).
- **Open world:** a 2D starmap grid of 100+ sectors (FTL-style); Meridian Station is sector one; encounters,
  resources and loot; hard, generated **wormhole instance** sectors off the map; steep difficulty; dying
  loses the ship and its hold.
- **Campaign:** built after the open world; 10+ modular story missions; you start in it and become a free
  agent when it ends; missions replayable in any order for modest rewards.
- **Multiplayer:** host-run co-op joined by a link; loot is brought back to your own world; simple trading; no anti-cheat.
- **Plan:** the code needs reorganising first (content as data, a pure simulation, split saves, sectors as
  data). That is `docs/REFACTOR_PLAN.md`, 15 steps in 4 milestones; progress is in `docs/ROADMAP.md`.
- **Next action:** **steps 0 to 9 are all complete and ticked — Milestone B is reached** (the owner
  confirmed the step 9 playtest on 2026-11-08). Ask before beginning the next work: **Milestone C —
  step 10** (sector definitions as data, replacing hard-coded `FIELD_CENTER` / `FIELD_SECTOR` /
  `parked` rock lists, and saving the current sector in `world.sector` as **save version 14**).
- **Step 9 design (save v13):** every save slot (`tr1`, `tr_s1`..`tr_s3`) and `TR1:` export code now
  stores `{ v: 13, profile, world }`, automatically migrating flat v1..v12 saves. `state.profile`
  holds the portable pilot (`cr`, `ship`, `ships`, `holds`, `loadout`, `hp`, `msl`, `pw`,
  `mission`, `kills`, `done`), and `state.worldState` holds the hosted world (`store`, `base`,
  `board`). `portableProfile(save)` and `mergeProfile(save, profile)` let a guest bring a character
  into another world and carry their loot, credits, ammo and hull damage back to their own save.
  Every step-9-owned local-only system (`inventory`, `fitting`, `economy`, `contracts`, `session`,
  `player`, `weapons`, `combat`, `missile`, `ai`, `step`) now operates on explicit per-pilot
  profiles against `state.worldState`: non-local pilots mine into their own hold, pick up crates,
  spend and persist missiles, earn kills and contract progress, spawn hunt targets, and dock/launch
  without clearing another active pilot's fight. Both 8b single-player oracle scripts match
  bit-for-bit, and **225 tests** pass (`tests/step9-save.test.mjs`, `tests/step9-local-only.test.mjs`).
- **Remaining local-only items (assigned to later steps in `TARGET_ARCHITECTURE.md`):** warp/sector
  ownership belongs to **step 10**; non-local death recovery, multi-ship rendering and guest input/net
  transport belong to **step 16** (multiplayer).

---

## Who you are working with

The user is building **Tallow Reach** and **does not code**. You are their programmer. Deliver
complete files or exact find-and-replace edits with full paths, and test steps that say **where to
click**, not just what file to open. Plain-language units (**MJ/s**, "units", "Hull HP" and
"Shield HP") — never MW, never "the dt-scaled integrator".

The project arrives as a zip; the folder you work in is `tallow-reach` (it holds `package.json`,
`build.mjs`, `src/`, `docs/`, `tests/`). The user plays by building it themselves (Node.js, then
`npm install`, `npm run build`, and opening `game/tallow-reach.html`), and has asked to be told
exactly how, so keep instructions step by step and say where to click. They plan to make the game
much bigger, including a storyline with missions: plan big features first (a short plan, the files
that change, whether the save changes) and build them in small slices that can each be played.

## Standing ground rules (the user stated these; do not break them)

- Keep the existing folders and conventions. **Restructuring is only done as a numbered step in
  `docs/REFACTOR_PLAN.md`** (the owner has approved that plan; refactor steps must not change how the
  game plays). **Tuning numbers go in `src/data/`** (one agreed exception: `NO_DRIVE_WARN` at the top
  of `src/sim/player.js`).
- Build **toward `docs/TARGET_ARCHITECTURE.md`**: never add code that deepens a debt listed there
  (for example `Math.random()` in `sim/`, new three.js objects stored in game state, a new
  hard-coded sector position, a new fixed list of item keys).
- **No npm dependencies.** Plain ES modules; only `three@0.128.0` and `esbuild`.
- Save format stays backward-compatible: bump `SAVE_VERSION` in `src/state/profile.js` and add a
  migration whenever saved data changes.
- Connect systems through the event bus (`src/util/events.js`), not cross-imports, unless the
  import is one-directional inside a layer.
- Do not change behaviour the user did not ask about.
- **Never edit `game/tallow-reach.html`** — it is generated by `npm run build`.
- Short entry at the top of `docs/CHANGELOG.md` for every change, included in the files you give.
- End every reply that changes `src/` by telling the user to run **`npm run build`** and
  **`npm test`**.
- Deliver **complete files** (not snippets) with full paths, so the user can drop them into the
  project, plus test steps written for a non-coder. If a change adds a feature the user will click
  through, add or update a `TESTING-*.md` checklist (`TESTING-OUTFITTING.md` and
  `TESTING-INVENTORY.md` exist at the project root). Say plainly if you could not run the build or the tests.
- Keep the docs a readable size: new changelog entry on top; when `CHANGELOG.md` has more than 15
  full entries, move the oldest to `CHANGELOG_ARCHIVE.md` until 10 remain and add an index line
  for each (see "Keeping the docs scalable" in `ARCHITECTURE.md`). Never delete history.
- Rewrite this file (do not append) when a long session ends.
- **`FLIGHT` and `CAMERA` are settled.** The Wasp on basic thrusters must feel exactly as it does
  now (`turn` 0.7, `strafe`/`lift`/`reverse` 0.3 of the drive's speed; chase camera 11 / 17 /
  10.5). The user said it "feels less arcadey, i like it a lot like this". Do not retune without
  being asked.
- A hull has **no speed, turn, shield or Hull HP of its own** — those come from the fitted
  modules (`sim/drive.js`, `sim/shield.js`, `sim/hull.js`). Do not add them back to `SHIPS`.
  All three hulls are identical apart from the **hold** (Wasp 20 m³, Bulwark 30, Prospector 70);
  `npm test` pins this. Per-hull differences will come later as module data or multipliers.
- The player must never be stranded: launch is 200 m out, docking range is 300 m, **G** docks.
- Units: one cargo unit = 1 m³. Use "Shield HP" and "Hull HP" in anything the player reads.

## What exists (all accepted by the user)

| Area | State |
| --- | --- |
| Sectors + flight | Two sectors (Tallow Reach, and an empty Kestrel Hollow). **M** warps between them (2 s sequence, coasts down, turn winds out). Settled flight feel; chase camera from `data/camera.js` |
| Outfitting screen | Ship switcher (arrows, name, `N of M in the hangar`) above a 3D ship window; seven bay groups around it; Appearance card with two empty paint bays; module picker per bay; storage; a **Services** box under the viewer with Hull repair and Missile restock for the ship shown |
| Modules | `power_basic` (10 MJ/s), `cell_basic` (100 MJ), `thruster_basic` (150 m/s, 69 deg/s, 10-unit boost tank), `shield_basic` (10 Shield HP), `hull_basic` (10 Hull HP), `cannon_basic` (1 dmg, 3/s per barrel, x2 linked, 2 MJ/s), `beam_basic` (1 ore per 4 s of contact, 340 m, 2 MJ/s, Shop 900 cr), `missile_basic` (8 dmg, 12 cap, 4 s reload, `ammo` 8, Shop 1500 cr incl. 8 missiles). All eight are on sale at Meridian (`data/shops.js`); the six standard parts cost 1 cr |
| Power | `state.power` = gen / cap / stored / draw; `use` has `drive`, `shield`, `guns`, `beam`; `hasPower()` gates every consumer; HUD shows `Using 4 of 10 MJ/s` |
| Thrusters | 150 m/s, 69 deg/s, boost x2; 10-unit tank, 2 a second out, 1 a second back; 20 MJ ignition; no thruster fitted = cannot move (and says so) |
| Shields | 10 Shield HP, 1 a second after 4 s without a hit, flat 2 MJ/s, bleed 1 a second when unpayable |
| Hull | 10 Hull HP from `hull_basic`; damage is kept as a fraction in `profile.hp[ship]` and only repaired for credits at the outpost (Outfitting > Services); asteroid collisions deal `speed * 0.015` over 25 m/s |
| Guns | Both primary bays fire on left click, each gun on its own cooldown; keys **1/2** cycle the primary slots (1 = guns, 2 = mining beam; an `Empty weapon slot` if nothing is fitted there). Right click = missiles (needs a launcher fitted) |
| Mining beam | One ore per 4 s of unbroken contact; progress is lost the moment contact stops; small bar with percentage under the "left in rock" hint; chime when an ore banks |
| Hostiles | One type, but now **data**: the **Newbie Raider** is the `raider` entry in `src/data/enemies.js` (10 Hull HP, no shields, 1 damage a shot). `spawnEnemy(id, pos)` in `sim/ai.js` builds it; `AI_BEHAVIOURS` holds the one behaviour (`chase`). **A hostile is plain data since step 7a** (`sim/enemy.js`): `{ id, kind, def, pos, quat, hp, ... }`, no mesh; `render/views.js` draws it. Kills emit `enemy-killed { def, faction, id }`; leaving the world (killed, out of range, field cleared) emits `enemy-removed { id }` |
| Shots, loot, sparks, rocks | **All plain data since step 7b.** A bullet `{ id, kind: "bullet", pos, quat, v, own, dmg, l }`, a missile `{ id, kind: "missile", pos, quat, d, sp, t, l, dmg }` (`sim/missile.js`), a crate `{ id, kind: "crate", pos, quat, t, item, spin }`, a spark `{ id, kind: "fx", pos, v, l, t, col, size }` (`sim/effects.js`), a rock `{ id, kind: "rock", sector, shape, pos, quat, s0, scale, r, type, ore, max }` (`sim/asteroids.js`). They go in and out of `state.world` only through `sim/entity.js`, which emits `entity-spawned` / `entity-removed { id, kind }`. The player's ship is `state.player.pos` / `.quat`, read only through `sim/pilot.js`. `render/views.js` owns every mesh, and draws the mining beam from `state.flight.beamStart` / `beamEnd` |
| Items | `ITEMS` in `data/items.js`: five goods (ferrite 10 cr, cobalt 24, voidite 60, salvage 70, reactor core 350, all 1 m³) plus an entry for each module (`{ cat: "module" }`, name/volume/stats in `data/modules.js`). A place is one stock `{ itemId: count }`; `sim/inventory.js` is the only mover |
| HUD | Top left: Shield HP, Hull HP and Boost as whole numbers, each label in its bar's colour; hold shown as `Hold 12/20 m³`; centre-bottom power block |
| Inventory | **Inventory tab**: the station's store above one ship's hold, arrows step through the hangar, `1`/`all` buttons move ore and modules between them. Everything is in m³ (ore 1 each, modules `vol`; station `250 x Storage bay level`, a hold is the hull's `cargo`). Each ship has its own hold (`profile.holds`). Purchases land in the station and you can buy as many as there is room for; Outfitting fits from the station's parts. Code: `sim/inventory.js` |
| Shop | Rows, prices and wording are data (`data/shops.js`); the Shop tab just draws `shopList()`. One generic purchase, `buyItem(shopId, itemId, qty)`. A row can be limited with `max` (none is yet); `setShopStock()` is the future restock hook |
| Input | `core/input.js` is the only file that knows a key code. It fills **`localPlayer().controls`** (`steer {x,y}`, `roll`, `thrust`, `strafe`, `lift`, `stop`, `brake`, `boost`, `fire`, `sec`; shape in `src/state/controls.js`) and the sim reads that. Each player owns independent controls; 8c makes the scoped systems player-aware and future work supplies guest input |
| Sound | The sim **emits** `sfx { name }` at eleven places and never imports `core/audio.js`; `SFX` in `core/audio.js` holds the exact waveform for each, played by one `on("sfx", playSfx)` listener. `tests/layers.test.mjs` fails if a `sim/` file imports `core/`, `ui/` or `render/`, or if a sound name and its `SFX` entry disagree |
| Saves | **Version 13** (`{ v: 13, profile, world }`), migrations for every change so far (v5 thrusters, v6 shields, v7 cannons, v8 beam, v9 missiles, v10 hull, v11 per-ship holds, v12 one stock per place, v13 profile/world split); old saves and `TR1:` codes keep working. `tests/saves/v11-real.json` and `tests/saves/v12-real.json` are converted in `npm test` |

## Where the knobs are

| You want to change | File |
| --- | --- |
| Hold size, hull colour/price | `src/data/ships.js` (`SHIPS`); Hull HP are the fitted `hull_basic` module (`src/data/modules.js`, `src/sim/hull.js`) |
| Turning, strafe/lift/reverse | `src/data/ships.js` (`FLIGHT`) — settled, do not retune |
| Chase distance | `src/data/camera.js` (`CAMERA`) — settled |
| What a module does (power, thrust, shield, hull, gun, beam, missile figures) | `src/data/modules.js` (`MODULES`, `STOCK_FIT`) |
| Which bays a hull has | `src/data/outfitting.js` (`SHIP_LAYOUTS`, `MODULE_GROUPS`, `APPEARANCE_SLOTS`) |
| An enemy's name, Hull HP, colour, size, speeds, ranges, damage | `src/data/enemies.js` (`ENEMIES`, the `raider` entry) |
| What an enemy drops, and what a rock is made of | `src/data/loot.js` (`LOOT_TABLES`); an enemy names its table with `loot` |
| How a hostile flies and shoots | `src/sim/ai.js` (`AI_BEHAVIOURS`, chosen by a def's `ai`) |
| Factions | `src/data/factions.js` |
| Missile flight and lock, ammo price | `src/data/weapons.js` (`MISSILE`) |
| What a shop sells, its prices, whether a row runs out | `src/data/shops.js` (`SHOPS`); how to add a row is recipe 4 |
| Warp timing and coast | `src/data/sectors.js` (`WARP`, `WARP_TIME`, `WARP_COAST`) |
| An item's name, category, price, volume or stack limit; adding an ore or a trade good | `src/data/items.js` (`ITEMS`) |
| Contracts, sectors, station prices | `src/data/contracts.js`, `sectors.js`, `station.js` |
| Randomness and seeds | `src/util/rng.js` (`random`, `setSeed`, `makeRng`) — never `Math.random()` in `sim/` or `data/` |

## How the module pattern works (copy this for the next part)

1. A part is one entry in `MODULES` in `src/data/modules.js`: `g` (which bay group), `n`, `d`, and
   the stat fields that group uses — **plus one line in `ITEMS`** in `src/data/items.js`
   (`beam_basic: { cat: "module" }`) so it is an item that can be carried and stored. `npm test`
   names a module with no item entry. If the player should be able to **buy** it, add a row to
   Meridian in `src/data/shops.js` (recipe 4); all eight basic parts are on sale there now.
2. A system owns the translation from modules to numbers and keeps it in `state`:
   `sim/power.js` → `state.power`, `sim/drive.js` → `state.drive`, `sim/shield.js` →
   `state.shield`, `sim/hull.js` → `P.hullMax`, `sim/guns.js` → `state.guns` / `state.beams` /
   `state.missiles`. Each has a `refresh*()` that is called after a fit change
   (`sim/fitting.js`), a ship change (`sim/economy.js`), a save load (`ui/menu.js`) and
   dock/launch (`sim/session.js`). **Add your refresh to all four places**, or the ship keeps the
   old numbers.
3. A system that burns power calls `setDraw("<name>", mjps)` every frame and asks `hasPower()`
   before it does its work. A new name must exist in `state.power.use` first.
4. The UI reads `state`, never modules: `ui/hud.js` for the flight readouts, `ui/screens.js` for
   the outpost panels (`moduleStat(m)` gives the one-line number in a bay).

## How the item pattern works (copy this for shops, loot and missions)

- Everything carryable is an entry in `ITEMS` (`data/items.js`); code asks `itemName(id)`,
  `itemVol(id)`, `itemValue(id)`, `canSell(id)`, `itemStack(id)` or `isModule(id)` — never a list of
  ids of its own. A place is `{ itemId: count }` and only `sim/inventory.js` moves things
  (`addItem`, `takeItem`, `moveItem`, `countOf`, `itemsAt`).
- A module's item entry carries no numbers: `MODULES[id]` is the one place its name, volume and
  stats live, and `npm test` checks the two tables agree in both directions.
- `valueOf(stock)` (in `sim/inventory.js`, with the refinery bonus) is what a pile sells for, and it
  counts spare modules too now that they have a value;
  selling and storing only ever touch items the catalogue gives a value to, so spare parts are safe.

## Known gaps (good next steps, none urgent)

- **Shops are data now, but there is one shop and nothing restocks.** `data/shops.js` holds every
  row and price, `buyItem(shopId, itemId, qty)` is the one purchase, and a row can be made to run
  out with `max` (no row does yet). The stock is session state, so it resets on load;
  `setShopStock()` in `sim/economy.js` is the hook for the restock timers/events/rolls the owner
  wants later. There is no second trader, and no way to buy ore or salvage (only parts are sold).
- Inventory limits: only the station's parts can be fitted (a module in a ship's hold must be
  moved back first), and cargo stays in the ship it is in when you switch ships. Spare modules can
  be sold from a hold or the station (60% of the shop price: beam 540, missile pod 900, the six
  standard parts 1) — right-click a MOD tile in Inventory, or the Base tab's Sell buttons. A part
  fitted in a bay is not for sale.
- One active contract at a time, and one enemy *type* in play (adding more is now a data entry, but
  nothing spawns a second type yet: the spawner only brings in the enemy a hunt contract names).
  Raiders no longer get tougher with the contract tier (they are all 10 HP now).
- Kestrel Hollow is empty, and there is no star map screen (M just cycles the sectors).
  One sector's geography (outpost, field) is written into the code.
- Salvage crates and sparks are cleared when you warp out (`clearWorldObjects()`); rocks stay,
  because they are the sector's.
- Current sector and mute state are not saved.
- Paint bays are clickable but no paints exist yet.
- Hulls differ only in hold size; ship-specific bonuses are meant to arrive later.
- Enemies keep shooting you during a warp charge; whether warp should grant invulnerability is
  an undecided design question.

## How to check your own work

The user runs, in the `tallow-reach` folder:

```
npm install       # once; needs network. node_modules is not in the zip and can be deleted any time
npm test          # 216 tests expected
npm run build     # writes game/tallow-reach.html
```

- `tests/headless.mjs` runs sim code (`src/sim/`) in a test with the 3D scene and the sound stubbed
  out. `tests/headless-sim.test.mjs` is step 7's worked example: one raider, 600 ticks, no browser,
  checking it closed in, turned and shot. `tests/headless-fight.test.mjs` is step 7b's: a shot's
  record, a hit, a kill with loot, a crate picked up and one expiring, a homing missile, mining a
  rock, clearing the world, and a check that the sim makes **no scene call at all**. `opts.keep: ["views.js"]` loads one
  `render/` file for real (used by `tests/views.test.mjs` to test the drawing code itself).
- Some AI sessions have no network. Then `npm install` fails, `node build.mjs` fails (no `esbuild`)
  and most tests fail (they import `three` through `src/util/math.js`). Say so plainly and tell
  the user to run the two commands, instead of guessing the result.
- To check gameplay headlessly (only if the packages are available): bundle a probe with esbuild,
  stubbing `src/render/scene.js` (the file needs a DOM). Call `createPlayer()` **and**
  `setShip(id)`, then step `flight(dt)` / `updatePrimary(dt)` / `updateShield(dt)` /
  `updatePower(dt)` yourself at `dt = 1/60`. Sim time is not wall time under software rendering,
  so read game state, not the clock. Rebuild probes from this description; none are kept.
- **Never let the sim read a mesh's `matrixWorld`.** three.js only refreshes it when the scene is
  drawn, so inside the frame loop it is *last* frame's transform. Build world points from a
  record's `pos` and `quat` by hand (`playerLocal` in `sim/pilot.js`, `chaseView` in
  `render/camera.js`). This is what made bolts leave from where the guns had been a frame earlier;
  it was fixed in 7b, and `tests/layers.test.mjs` fails if a `sim/` file names `matrixWorld`.
- For a refactor step, the strongest check is an **old-vs-new probe**: bundle the previous commit's
  tree and the working tree with esbuild (stubbing `src/render/*` and `src/core/*`, real `three`),
  run one scripted session through both, and compare state after every step. Step 4's probe did 29
  steps (buy, refuse, move, fill a hold, fit, unequip, buy and switch ships, store, load, sell) and
  also compared the rendered Inventory/Shop/Base HTML: identical. **Step 7b's probe** did the same
  for the flight loop: twenty scripted snapshots (start, thrust, brake, strafe, turned, boosted,
  spawned, four and eight shots fired, missiles, hurt, two lock states, mined, beam off, cleared,
  killed, picked up, end) with the pilot, power, every hostile, bullet, missile, crate, spark, rock,
  the lock and the hold fingerprinted each time — **0 differences**. The one trick it needs: call
  `updateMatrixWorld()` on the old build's ship after every teleport, or the old build fires from a
  stale transform and the shot positions differ for that reason alone. Probes are never kept.
- **Getting the project as a zip:** every ticked step is a git tag, and GitHub builds a zip for any
  tag on request — `https://github.com/voltvehiclez/Tallow-Reach/archive/refs/tags/step7b.zip`
  (replace `step7b` with `step6b`, `step7a-ticked`, ...). No upload is involved, so this works even
  when the sandbox cannot reach GitHub's upload host (it cannot). Tag each finished step.
- **Play-testing from inside a chat:** `node serve.mjs` (then open the port it prints) serves
  `game/tallow-reach.html` over HTTP with caching off, so a rebuild shows on refresh and the owner
  can play the current build in the browser without copying files. It is a convenience only — no
  `src/` file imports it, and the real build is still `npm run build` producing one HTML file.
- Some sessions have Chromium and Playwright; check before assuming either way.
- The user tests by clicking through the `TESTING-*.md` files. Keep them current: they are the only
  bridge between the code and someone who does not read it.
- Known-unverified: loading old saves in the real built game (the Inventory tab, shops and the
  whole flight loop have all been confirmed by the owner's playtests or by a probe). Ask the user
  how it played if it matters to the task.

## To start the next session

Say what you want to build, and point the assistant at this file. It will read this plus
`VISION.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `TARGET_ARCHITECTURE.md`, `HOW_TO_ADD.md`,
`CHANGELOG.md` and the `README.md` of the folders it will touch, and be ready in one step. The
starter prompt (and the refactor-step prompt) are in `docs/AI_PROMPTS.md`.
A new baseline smoke test that covers the whole game is `TESTING-BASELINE.md`.
