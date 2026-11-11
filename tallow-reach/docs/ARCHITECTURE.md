# Tallow Reach: code architecture

**Reading order for an AI assistant:** [HANDOFF.md](HANDOFF.md), [VISION.md](VISION.md) and
[ROADMAP.md](ROADMAP.md) first, then this file (the code **as it is now**), then
[TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) (where it must go), then [HOW_TO_ADD.md](HOW_TO_ADD.md)
(step-by-step recipes), then the `README.md` in the folder you are about to edit,
then [CHANGELOG.md](CHANGELOG.md) (what earlier sessions changed: the newest entries in full,
plus a one-line index of every older entry). Open [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md)
only when the index shows an older entry that matters to the task. See "Keeping the docs
scalable" at the end of this file.

## Running it

```
npm install          # once
npm run build        # writes game/tallow-reach.html (single file, works offline)
npm run watch        # rebuilds on every save
npm test             # unit tests: data and save layers, plus content checks
```

`tests/headless.mjs` runs gameplay code (`src/sim/`) in a test with the screen and the
speakers stubbed out, so a test can spawn an enemy and read the result without a browser.
It bundles with esbuild (already a dev dependency) and adds no package.

`game/tallow-reach.html` is **generated** from `src/`. Never edit it by hand. It only
changes when someone runs `npm run build`, so every change to `src/` should end with
a reminder to rebuild. It is self-contained (three.js is bundled in), so it still
runs when opened from disk.

## Layers

Dependencies only point downward. Lower layers never import higher ones.

> **Layer boundary:** steps 6 and 7c removed sim imports of core, UI and render. Sector
> scenery follows `sector-entered`, and `main.js` supplies the previous rendered camera direction
> for missile lock. `tests/layers.test.mjs` enforces empty allow-lists. Hull mounts are shared data
> (`data/mounts.js`), used by `sim/pilot.js` and the `PlayerShipView` in `render/views.js`.
> The full list of debts and the target shape are in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md).

```
main.js                 boot + frame loop
ui/                     HUD, outpost menus, pause overlay       (reads state, calls sim actions)
render/                 three.js scene, models, camera          (reads state, never changes game rules)
sim/                    gameplay rules: flight, combat, economy, contracts, lifecycle
state/                  runtime state, persistent profile, save storage
data/                   static tuning: ships, items, weapons, station, contract templates
core/                   audio synth, keyboard/mouse input
util/                   math helpers, event bus, seedable RNG
```

Sideways imports inside a layer are fine when they are one-directional (for example
`sim/session.js` uses `sim/world.js`). To connect two systems that should not know
about each other, use the event bus instead.

## Where things live

| You want to...                       | Edit                                           |
|--------------------------------------|------------------------------------------------|
| Add or rebalance a ship              | `data/ships.js`                                |
| Add an item (ore, salvage, trade good) or change prices | `data/items.js` (`ITEMS`); see HOW_TO_ADD.md recipe 2 |
| Tune the basic cannon                 | `data/modules.js` (`cannon_basic`: `dmg`, `rate`, `bspd`, `draw`) |
| Tune the mining beam                  | `data/modules.js` (`beam_basic`: `period`, `range`, `draw`)  |
| Tune the missile (flight, lock, ammo price) | `data/weapons.js` (`MISSILE`)            |
| Add a shop row, change a price, or make a row run out | `data/shops.js` (`SHOPS`); see HOW_TO_ADD.md recipe 4 |
| Add a second trader or station shop  | `data/shops.js` (a new `SHOPS` entry) and point the counter at it (`OUTPOST_SHOP` today); see HOW_TO_ADD.md recipe 17 |
| Change base module costs             | `data/station.js`                              |
| Add a contract type                  | `data/contracts.js` (list, generator, wording), plus a listener in `sim/contracts.js` |
| Add an authored pocket/system | `data/places.js` and `data/terms.js`; see HOW_TO_ADD.md recipe 14 |
| Change starmap generation, visibility, tiers, chart look or travel costs | `data/galaxy.js`; resolved by `sim/galaxy.js`, installed by `sim/galaxy-session.js`, quoted by `sim/travel.js`, drawn by `ui/starmap.js` |
| Move a system, delete/promote a pocket, add a route | `GALAXY_OVERRIDES` in `data/galaxy.js` or `PLACE_LINKS` in `data/places.js`; see HOW_TO_ADD.md recipe 20 |
| Change the warp timing or its lockout | `WARP` in `data/sectors.js` (the look itself follows those numbers) |
| Add an enemy, or change one's numbers, colour or size | `data/enemies.js` (`ENEMIES`); see HOW_TO_ADD.md recipe 6 |
| Change what an enemy drops, or the ore mix of rocks | `data/loot.js` (`LOOT_TABLES`); see HOW_TO_ADD.md recipe 18 |
| Change how a hostile flies or shoots | `sim/ai.js` (`AI_BEHAVIOURS`, chosen by the def's `ai` field) |
| Add or rename a faction              | `data/factions.js` (`FACTIONS`)                |
| Change flight feel                   | `sim/player.js` (`flight`)                     |
| Rebind keys                          | `BINDINGS` (one-off actions) and `HELD` (flight and weapons) in `core/input.js` |
| Add an outpost screen (tab)          | `ui/screens.js` (`TABS`, `SCREENS`, a HTML function) and `ui/menu.js` (`ACTIONS`) |
| Add a module                         | `data/modules.js` (`MODULES`, `STOCK_FIT`); see HOW_TO_ADD.md recipe 16 |
| Swap modules between ship and storage| `sim/fitting.js` (`fitModule`, `unequip`, `storedFor`); picker in `ui/screens.js`, actions in `ui/menu.js` |
| Change how a bay opens or closes    | `ui/picker.js` (one picker at a time, pure and tested) |
| Change how much an item takes up, or how big a hold or the station store is | item `vol` in `data/items.js` (a module's `vol` is in `data/modules.js`), hull `cargo` in `data/ships.js`, `STORAGE_PER_LEVEL` in `data/station.js` |
| Move things between the station and a ship, or buy one into storage | `sim/inventory.js` (`moveItem`, `addItem`, `takeItem`, `buyItem`); the Inventory tab is `inventoryHtml()` in `ui/screens.js`, its buttons are `mv`/`invPrev`/`invNext` in `ui/menu.js` |
| Give a hull its own bays             | `data/outfitting.js` (`SHIP_LAYOUTS`)           |
| Change what power does in flight      | `sim/power.js` (`powerOf`, `hasPower`, `setDraw`, `updatePower`) and `state.power`; who draws what is `sim/drive.js` + `sim/player.js` (drive), `sim/shield.js` (shields) and `sim/weapons.js` (guns) |
| Change how a ship flies               | the thruster module in `data/modules.js`; `sim/drive.js` turns it into `state.drive` |
| Change what shields do in flight      | `sim/shield.js` (`shieldOf`, `refreshShield`, `updateShield`) and `state.shield`; the numbers are on the shield module |
| Change what the guns do in flight     | `sim/guns.js` (which guns are fitted, `state.guns`) and `sim/weapons.js` (`updatePrimary`); the numbers are on the `cannon_basic` module |
| Add or reorder outfitting bay groups | `data/outfitting.js` (`MODULE_GROUPS`)          |
| Add a paint bay to Appearance        | `data/outfitting.js` (`APPEARANCE_SLOTS`), drawn by `appearanceHtml()` in `ui/screens.js` |
| Change the ship in the Outfitting view| `render/shipviewer.js` (camera, lights, framing); `ui/outfitting.js` (page, input) |
| Change the pause menu                | `ui/pause.js`, styles under "Pause overlay" in `styles.css` |
| Change colours or layout of any UI   | `styles.css` (sections are labelled)           |
| Add a sound                          | `core/audio.js` (`SFX` entry; the sim only emits `sfx`) — see HOW_TO_ADD.md recipe 9 |
| Change what gets saved               | `state/profile.js` (`newProfile` / `newWorld`, `sanitizeProfile` / `sanitizeWorld`, bump `SAVE_VERSION`, add a migration in `sanitizeSave`) |
| Change the in-flight power readout   | `ui/hud.js` (the power block) and `#pw` in `src/index.html`, styles under "Flight HUD" |
| Change randomness, or make a run reproducible | `util/rng.js` (`random`, `setSeed`, `makeRng`) |
| Add tests                            | `tests/` (`*.test.mjs`, run by `npm test`)     |

## File map

```
src/main.js            boot, action handling (lock, weapon, dock, starmap, travel, pause), frame loop
src/index.html         page shell: HUD elements, outpost panel, hint text
src/styles.css         all styling, in labelled sections
src/data/              tuning numbers and content tables (ships, items, weapons, station, contracts, places, terms, camera, outfitting bays and paint slots, modules, enemies, factions, loot tables, shops, galaxy)
src/util/              events.js (bus), rng.js (seedable random), math.js (vectors, helpers), ids.js (entity ids)
src/core/              audio.js (synth + mute), input.js (keys -> local player controls + named actions)
src/state/             state.js (runtime), profile.js (saved data), storage.js (slots, codes)
src/sim/               player, pilot (where the ship is), power, drive, fitting, inventory, shops' purchases (economy),
                       weapons, missile, combat, ai, enemy (a hostile as data), entity (every other entity as data),
                       loot, asteroids, places, galaxy (resolved starmap web), galaxy-session (seed/save adapter), travel (pure route quotes), targeting, contracts, session, sectors (warp), effects, world
src/render/            scene.js (including one group per place), models.js, camera.js, warpfx.js, shipviewer.js (Outfitting),
                       views.js (a mesh per entity, the player's ship and the mining beam)
src/ui/                hud.js, menu.js (button actions), screens.js (outpost HTML), outfitting.js (ship window), picker.js (open bay), pause.js, starmap.js (M galaxy/system chart), warpflash.js
tests/                 profile.test.mjs (saves, RNG), content.test.mjs (data completeness),
                       enemies.test.mjs (enemies as data), headless-sim.test.mjs (600 ticks, no browser),
                       headless-fight.test.mjs (a whole fight, no browser: shots, crates, missiles, mining),
                       views.test.mjs (the mesh follows the entity), headless.mjs (test helper)
docs/                  this file, HOW_TO_ADD.md, AI_PROMPTS.md, HANDOFF.md, CHANGELOG.md (recent + index), CHANGELOG_ARCHIVE.md (older, full text)
```

Each `src/` folder also has its own short `README.md`.

## Conventions

- **All randomness goes through `src/util/rng.js`.** Gameplay code calls `random()` (or `R(a, b)`
  from `util/math.js`, which is built on it); nothing in `src/sim/` or `src/data/` may call
  `Math.random()` — `tests/rng.test.mjs` fails and names the file and line if it does.
  `setSeed(n)` makes a whole run reproducible, `setSeed(null)` goes back to `Math.random` (the
  default), and `makeRng(n)` hands out an *independent* generator so generating a place or an
  instance never depends on how many dice combat rolled before it. Anything that must be repeatable
  from a seed (places, wormhole instances, co-op) takes a `makeRng` generator rather than reaching
  for the shared one.
- **Shops are data, buying is one function.** `data/shops.js` holds `SHOPS`: per shop a heading (`n`),
  its line of explanation (`d`) and `stock`, one row per item: `id` (from `ITEMS`), `price`, the row's own wording `n`/`d`, and
  optionally `max`. **No `max` means the shop never runs out**; with `max` the row shows "N left",
  greys out at zero and `buyItem()` refuses. Prices live on the row, not on the item, so two
  traders can charge differently for the same part. `sim/economy.js` has the only purchase —
  `buyItem(shopId, itemId, qty = 1)` — and `shopList(shopId)` is what the Shop tab draws; nothing
  hard-codes a shop, a row or a weapon key in the screen, and `SHOP_WEAPONS` is gone. **A stock row
  is the only way a part appears on the shop screen**: one row per part, no second "already owned"
  list (the old `kit` list was removed for listing the cannons twice). A part the ship flies with
  is either on sale or not mentioned. How much of a
  limited row is left is **session state** (`state.shops`, `shopStock()`, `setShopStock()`), not
  saved: a restock timer, event or roll later calls `setShopStock()` and nothing else. A purchase
  still lands in the station's inventory through `sim/inventory.js`, and the missiles that come
  with a pod are the module's `ammo` (`data/modules.js`), not a number in the shop code.
- **Loot is data.** `data/loot.js` holds `LOOT_TABLES`: an enemy's drops (each line a chance `w`, a
  count range `c` and a scatter `j`) and a rock's ore mix (weighted `pick`). `sim/loot.js` is pure
  and rolls them — `rollLoot(id, rng)` for drops, `pickLoot(id, rng)` for one weighted pick — so a
  test can roll a table 10,000 times and check the odds. An enemy names its table with `loot` in
  `data/enemies.js`; a crate in the world carries the item id it holds (`{ m, t, item }`) and nothing
  else knows which item a crate is. Do not write a drop rule in `sim/` again.
- **A place is one stock of items.** `ITEMS` in `data/items.js` is the catalogue: every ore, every
  salvage good and **every module** (a module's entry is just `{ cat: "module" }` — its name, volume
  and stats stay in `data/modules.js`, keyed by the same id). A place — the hosted station's `worldState.store`,
  a pilot's `profile.holds[id]` — is `{ itemId: count }`, nothing else; there is no list of cargo keys
  and no separate list of spare parts, and `npm test` fails if any file reads `profile.cargo`,
  `profile.modules`, `KEYS`, `emptyCargo` or `ITEM_VOL` again. `sim/inventory.js` is the only code
  that moves things between places or measures how full one is (`loadOf`/`freeOf` in m³,
  `addItem`/`takeItem`/`moveItem`, `countOf`, `itemsAt` for the screens). Code asks the catalogue
  what something is called, how big it is and what it is worth — `itemName`, `itemVol`, `itemValue`,
  `canSell`, `itemStack`, `isModule` — and never names an item id of its own. **A spare module sells
  like anything else**: its catalogue entry carries a sell value `v` (60% of the shop price, never
  below 1 credit, kept in step by a test), so `canSell()` is true for it and every selling path —
  right-click a MOD tile in Inventory, or the Base tab's Sell hold / Sell stored — treats it as an
  item. A module fitted in a bay is in **no** stock, so it is never sold; only stocks are.
- **Enemies are data, and a hostile is plain data too.** `data/enemies.js` (`ENEMIES`, keyed by
  id) holds every hostile's name, plural name, Hull HP, colour, scale, faction, numbers and the id
  of its behaviour. `sim/ai.js` spawns one with `spawnEnemy(id, pos)`, and the entity it makes
  carries `def` (the id) and `f` (the faction id) so events and screens can name it. A def's `ai`
  field picks a function from `AI_BEHAVIOURS` in `sim/ai.js`; adding *numbers* is a data edit,
  adding a *way of fighting* is one function there. `tests/enemies.test.mjs` spawns a fake enemy to
  prove no enemy lives in code.
  **Since step 7a an enemy is a record, not a mesh** (`sim/enemy.js`):
  `{ id, kind: "enemy", def, n, f, loot, hp, mx, pos, quat, v, fire, o }`. Positions and rotations
  are three.js `Vector3`/`Quaternion` — maths types, which the target architecture allows — and the
  mesh is `render/views.js`'s business: it listens for `enemy-spawned` / `enemy-removed` and sweeps
  the list every frame. **Never give an entity a mesh again**; add the drawing to `render/views.js`.
  Since 7d a registry in `render/views.js` defines each kind's list, build, update and cleanup;
  one active-view map namespaces enemy and other entity ids because their counters are separate.
  `tests/views.test.mjs` registers a fake kind to prove the common machinery is extensible.
  Kills emit `enemy-killed { def, faction, id }`; a hunt contract names the def it counts (`e`).
- **Every other entity is a record too (step 7b).** A bullet, a missile, a loot crate, an explosion
  spark, a rock and the player's own ship are all plain data with an `id` and a `kind`, held in
  `state.world` (`bullets`, `missiles`, `crates`, `fx`, `asteroids`) or on `state.player`. They are
  added and removed only through `sim/entity.js` (`addEntity` / `dropEntity` / `clearEntities`),
  which emits `entity-spawned` / `entity-removed { id, kind }`; ids come from `util/ids.js`, a
  counter that never touches the seeded RNG. Positions and rotations are three.js maths types
  (`pos`, `quat`); a rock also carries `s0` (its born size), `scale` (its drawn size, which mining
  shrinks — the collision rule reads it) and `shape` (which lumpy model). The player's ship is read
  only through `sim/pilot.js` (`playerPos`, `playerFwd`, `playerLocal`, `facePlayer`); `playerLocal`
  builds a point in the ship's own frame from `pos`/`quat`, never from `matrixWorld`.
  **`src/sim/` holds no mesh, material or scene object**; `tests/layers.test.mjs` fails if one is
  named in a sim file's code.
- **The starmap web is resolved data, not UI geometry.** `data/galaxy.js` holds generation tuning,
  visibility policy, advisory tier rules, free local travel default, empty route costs/requirements,
  central-body chance/radii and `GALAXY_OVERRIDES`.
  `sim/galaxy.js` generates an organic 2D web through a replaceable generator registry, applies author
  patches/tombstones by stable id, prunes links to deleted pockets, assigns travel defaults, tiers and
  independent seeded visual cores, then validates policy-aware reachability. A gate pocket has exactly
  one external gate peer; internal link records remain for the route-only opt-out. `sim/travel.js` quotes
  free same-system hops unless `intraSystem: "links"` requires an enabled internal link; cross-system
  hops always require their explicit gate. Quotes return plain cost/mode/requirement results. Moving a system, deleting a pocket, promoting a pocket to a gate or replacing the generator
  must remain data/registry edits; do not put those rules in the map screen or warp animation.
  Step 11B installs the resolved web as the live place catalog (`setPlaceCatalog`) and keeps it in
  session `state.galaxy`. `sim/galaxy.js` also derives a deterministic per-system pocket layout
  (`systemPocketLayout`, author `mapPos` overrides win) for the zoomed-in chart: ordinary pockets orbit
  the visual core and gates sit farther out toward their peers. Core kind/name, policy and layout are
  resolved data, never saved. `ui/starmap.js` draws the galaxy web and system pocket map, omitting internal
  lines in free systems and retaining gate exit stubs toward visible peers. Its non-warpable core has a
  permanent two-line proper-name/type label, while `pocketLabelLayout` collision-checks pocket names and
  nearby dots, drawing a connector when a crowded label is nudged or moved to the clearer side. The click/right-click popup opens just to the right of
  the pointer with **Set destination** first; it emits a named travel action for **Warp to**, and `sim/sectors.js`
  requotes the same hop before running the unchanged warp sequence. Setting a destination keeps refusal
  notices but omits the generic bottom confirmation in both map modes. `route-display.js` is shared by the HUD and starmap;
  only the final system row for an exact `{ pocketId: ... }` destination gets a small parenthetical pocket name.
- **Data tables use short keys.** Ships: `n` name, `d` description, `cargo`, `dmg`,
  `mine`, `sc`, `price`, `col` (Hull HP come from the fitted hull module). Items: `n`, `cat`, `v`,
  `vol`, `st`.
  Contracts: `n` count, `r` reward, `o` ore, `p` progress. Keep the short keys when adding entries.
- **Tuning numbers go in `src/data/`.** Constants private to one system (ranges, timers)
  may sit at the top of that file with a comment.
- **`matrixWorld` is last frame's transform.** three.js only refreshes it when the scene is
  drawn, so `object.localToWorld(v)` during the frame loop silently uses where the object was
  one frame ago — an error that grows with speed. This is what made the chase camera trail
  further the faster the ship flew, and it is why bolts used to leave from where the guns were
  last frame. Build world points from a record's `pos` and `quat` by hand when the result matters
  (`playerLocal` in `sim/pilot.js`, `chaseView` in `render/camera.js`). **No code outside
  `render/` may read `matrixWorld` at all** — `tests/layers.test.mjs` enforces it for `sim/`.
- **Camera trail has one home: the `CAMERA` table in `data/camera.js`** (`base` 11, `fast` 17,
  `reverse` 10.5, with the pure helper `cameraTrail(vf, fwdTop, revTop)`). It is the only thing
  that changes the chase distance with speed; the camera's easing must never see the ship's
  travel, or speed leaks back in.
- **The boost tank is part of the drive too.** `data/modules.js` gives the thrusters
  `bmax`/`buse`/`bfill` (tank size, units a second out, units a second back); `sim/drive.js`
  carries them on `state.drive` and sizes `state.player.enMax`, and `sim/player.js` burns and
  refills `player.en`. The HUD prints `en / enMax` beside the bar. Nothing else knows the numbers.
- **Speed and turn have one home: the fitted thrusters.** `sim/drive.js` reads the thruster
  module and writes `state.drive = { spd, turn }`; `sim/player.js` and `render/camera.js` read
  that and nothing else. Hulls no longer carry `spd`/`turn` at all: do not add them back and do
  not hard-code a speed. Swap the module, or add a field to it.
- **No thruster fitted means a dead ship.** `driveOf()` returns `{ spd: 0, turn: 0 }` when the
  thruster bay is empty (there is no hull fallback, on purpose: the bays are what make the ship
  fly). `flight()` then holds the throttle at 0 and refuses boost as well as thrust, so holding
  W, Shift or the mouse does nothing at all, and pressing any of them raises the centre-screen
  warning "Equip thrusters to move" (`tryingToMove()` in `sim/player.js`, repeat-limited by
  `state.player.noDriveT`). The HUD prints "No thrusters fitted: press G to dock and fit one."
  and `launch()` says the same in the centre message. Test it with any hull
  plus an empty thruster bay (`hasDrive(state.drive)` is false). Docking range is 300 m and
  launch puts the ship at 200 m, so an immobile ship can always dock straight back.
- **Shields come from the shield module, not the hull.** `sim/shield.js` reads `sh` (Shield HP),
  `regen` (Shield HP a second) and `delay` (seconds without a hit) and writes `state.shield` plus
  `P.shMax`. Any hit stamps `P.last` (in `hurt()`), and the recharge stays off until that was
  `delay` seconds ago; then it runs at full `regen`. No shield module means `P.shMax` is 0 and
  every hit goes to the hull. Later shield types with special behaviour (recharging under fire)
  are extra fields read by `updateShield()` — nothing outside that file changes. Shields also cost
  power: a flat `draw` MJ/s (2 on the basic module) all the while they are up, reported through
  `setDraw("shield", ...)` so `state.power.draw` stays the whole ship's bill. When the ship cannot
  pay that (no plant, flat cells) they bleed away at `drain` Shield HP a second and stay at 0 until
  the power comes back.
- **Hull HP come from the hull module, not the hull.** `sim/hull.js` reads `hp` from the
  fitted hull module the same way shields read `sh` — `hull_basic` grants 10 Hull HP, and it
  is standard issue. No hull module fitted means the ship has no Hull HP at all: `P.hullMax`
  is 0, `P.hull` is 0, and the first hit that reaches the hull emits `player-dead` (see
  `hurt()`) — a one-shot kill, exactly like taking the shields off. The hull has no recharge and
  no power bill: damage is only ever repaired at the outpost, for credits. The fraction left is
  kept in `profile.hp[ship]`, stamped on every hull hit (`hurt()`) and on dock, so a fit change
  or a hangar visit keeps the damage taken — never a free repair, and taking the module off at
  the dock un-fits the ship without forgetting the fraction it had. Repair costs
  (`economy.repairCost`) read the fitted module's Hull HP, not a hull stat.
- **Guns come from the primary bays, not the hull.** A gun is a module in the `primary`
  group (`cannon_basic`: `dmg` a shot, `rate` shots a second per barrel, `bspd` bullet speed, `draw` MJ/s,
  and `barrels` for linked barrels fired side by side, default 1).
  `sim/guns.js` turns the fitted bays into `state.guns`, one entry per gun in bay order, and
  `updatePrimary()` in `sim/weapons.js` fires them all on left click, each on its own
  `1 / rate` cooldown, from its nose hardpoints (a linked pair — the basic cannon —
  fires from the two fixed hardpoints at ±1.8 m, one bolt per side, the pre-module
  layout; a lone barrel fires from its bay position, `-1.8 + 3.6 * i` metres across
  the nose). The bay
  index is the only difference between the two bays: the same module behaves the same in
  either one, and there is no separate key for either. The gun's damage is multiplied by the
  hull's `dmg` (1 on every hull — the hulls are identical apart from the hold for now), so
  the module figure is the number the game uses. While the trigger is held and the guns are firing they report
  `setDraw("guns", draw * guns fitted)`; `hasPower()` decides whether they may fire at all, the
  same rule the thrusters follow. `state.flight.gunCd` holds one cooldown per fitted gun.
  Whether they fired on a given frame is worked out inside `updatePrimary` and kept there — it
  is per-frame and purely local, so it is not a field of `state.flight` (the old stored copy was
  never read by anything outside `sim/weapons.js`).
- **The mining beam is a module too, not a weapon flag.** `beam_basic` lives in the `primary`
  group (`period` 4 s of continuous contact per ore before the hull's `mine` multiplier,
  `range` 340 m, `draw` 2 MJ/s), sold at Meridian for 900 cr (`data/shops.js`) — buying it puts the module in
  storage, from where it can be fitted in either primary bay like a gun (key 2 selects the
  beam slot; with no beam fitted that slot is the `Empty weapon slot`).
  `sim/guns.js`'s `beamsOf()` picks the fitted beams (a primary module with `period`, no
  `dmg`), and `state.beams` holds them; `updatePrimary()` only cuts with the beam slot
  selected, a rock in reach and the power to pay (`setDraw("beam", …)`, `hasPower()`,
  `state.power.use.beam`), it draws only while actually cutting, and a whole ore banks per
  `period` of continuous contact (1 ore per 4 s, `best.ore` depletes per ore, the rock
  disappears when dry). The hull's `mine` multiplier is 1 on every hull. **The moment contact stops, the progress toward the next ore is
  lost** — `state.flight.beamT` (contact time) tracks it; docking, launching, a fit change
  or a warp clear it too. A small bar with the percentage (`#bm` in the HUD, directly under
  the "left in rock" hint) shows the progress while the beam is cutting; it is hidden
  otherwise. **A full hold stops the beam before it cuts at all** (`Cargo hold full`), so there is
  no progress to bank. Each completed ore plays a chime (the `ore-gained` entry of `SFX` in
  `core/audio.js`, emitted once per ore the beam secures, above the loop that puts the ore in the
  hold). The beam
  is not a gun: `gunsOf()` never returns it, so the guns and the beam slot never both fire.
  The first fitted beam (lowest bay) acts if two are fitted. Saves that owned the old shop
  beam were given one `beam_basic` in storage in save version 8 (not auto-fitted).
- **The missile lock ring is sized by the screen, not the sim.** The sim reports the cone in
  degrees (`state.flight.coneAngle`: `MISSILE.cone` while a launcher is fitted and no warp is
  running, else 0) and `coneRadiusPx()` in `ui/hud.js` turns that into the ring's pixel radius
  with the camera's field of view and the window height. Same numbers as before the move; do not
  put the pixel maths back in `sim/`.
- **The missile launcher is a module too — it replaced the old `wp.msl` flag.** `missile_basic`
  lives in the `secondary` group (`dmg` 8, `cap` 12, `cd` 4 s, `ammo` 8), sold at Meridian for
  1500 cr like the old launcher, and a purchase tops the rack up to the module's `ammo` (8
  missiles) without ever taking any away — buying it puts the
  module in storage, fitted in the secondary bay like any other module. The missile itself is
  unchanged (`data/weapons.js`: `sp0` 140, `max` 480, `acc` 300, `life` 7 s, `turn` 5.5,
  lock 2.34 s in the dashed cone, 20° cone, 2500 m range, `unitPrice` 35 cr per missile in
  the Shop). `sim/guns.js`'s `missilesOf()` picks the fitted launchers (a secondary module
  with `dmg`), `state.missiles` holds them, `updateMissiles()` only locks and fires with one
  fitted, `F.missileCd` uses the module's `cd` instead of the old flat 0.9 s, and a fired
  missile carries its module's `dmg` (8) into the world so a mid-flight fit change cannot
  alter it. Damage is 8 per missile — it used to be 80. The restock row in the Outfitting services box (below the 3D viewer) shows when
  a launcher is fitted, capped by that launcher. Saves that owned the old launcher were given
  one `missile_basic` in storage in save version 9 (not auto-fitted); the whole `wp` object
  left the save.
- **The primary line and the equip toast use the equipped modules' own names.**
  `moduleListName()` in `sim/guns.js` builds them (`Basic cannons`, `Basic cannons x2` in a
  doubled bay, `Basic mining beam`, `A + B` for a mixed pair), so the HUD and the toast can
  never drift apart from what is actually fitted.
- **`FLIGHT` in `data/ships.js` still scales every ship at once**: `turn` multiplies the
  drive's turn rate, and `strafe` / `lift` / `reverse` are fractions of the drive's `spd`. The
  main drive and its 2x boost are the only directions that reach full speed.
- **Inventory: every place is measured in m³, and `sim/inventory.js` is the one home for it.** Since
  step 9 (save v13), the **hosted station** keeps its stock (`{ itemId: count }`) in `worldState.store`
  and its room is `STORAGE_PER_LEVEL` (250) times `worldState.base.store`. Each **ship's hold** is
  `profile.holds[shipId]` (`{ itemId: count }`), owned by that pilot's portable `profile`, and its room
  is the hull's `cargo`. One unit of ore is 1 m³; a module's volume is its `vol`. A module fitted in a
  bay takes no space anywhere. Purchases land in the hosted station (`buyItem`, no limit on how many of
  one part you can own, only on room), the player moves things in the Inventory tab (`moveItem`), and
  Outfitting bays are fitted from the **station's** parts (`worldState.store`). Mining and crate pickup
  write to the acting pilot's flown ship hold; nothing reads a single `profile.cargo` any more. A ship's
  cargo stays in that ship when you switch to another, and a ship that is lost takes its hold with it.
  Do not write `profile.holds` or `worldState.store` outside `sim/inventory.js`, `sim/fitting.js` and
  `sim/economy.js`.
- **Fitting lives in one place.** `sim/fitting.js` is the only code that writes `profile.loadout`, and
  it refreshes the acting pilot's ship power, drive, shields, hull and guns after every change.
  Anything else that changes a bay must go through it, or the ship keeps the old numbers.
- **Outpost actions** are functions in `ACTIONS` in `ui/menu.js`. A button carries
  `data-a="actionName"` and optionally `data-b="argument"`. After each click the panel
  re-renders and the game autosaves.
- **Economy and contract functions** change `state.profile` and may return a message
  string, which the panel shows as a green toast.
- **Screens are pure functions** that return an HTML string from the current state.
  They never change state.
- **The sim runs at 60 ticks a second** (`sim/step.js`, `data/simulation.js`); the frame loop
  accumulates time and keeps the old 0.05-second stall cap. Pause does not advance it. Screen and
  sound randomness use a separate cosmetic stream. Between 60 Hz ticks, `render/views.js`,
  `render/camera.js` and `ui/hud.js` interpolate visual poses using `simClock.alpha()` (keeping
  previous-tick poses in a render-side `WeakMap` so simulation state stays untouched and 240 Hz
  displays see smooth per-frame motion without sawtooth jitter; teleports with `P.snap` snap
  immediately). Missile aim still samples the last rendered camera direction; stable asteroid and
  encounter cooldowns use simulation-time place memory instead of wall-clock callbacks.
- **Anything that accumulates must be multiplied by `dt`.** A constant added per frame
  (`camera.rotateZ(0.05)` every frame, say) silently depends on the frame rate: harmless on a
  60 Hz screen, a visible bug on a 240 Hz one. This bit the warp roll once. Use
  `x += rate * dt`, or steer toward a target with `1 - Math.exp(-k * dt)`.
- **The Outfitting ship has its own renderer.** The outpost panel is HTML sitting on top
  of the game canvas, so a view inside it needs its own canvas and WebGL context
  (`render/shipviewer.js`). The panel rebuilds its HTML on every click, which takes that
  canvas out of the page without destroying it; `ui/outfitting.js` puts the same canvas
  back into `#shipview` after each render. Do not create a renderer per render, and keep
  `id="shipview"` in `outfittingHtml`.
- **The sim never reads the keyboard.** `core/input.js` is the only file that knows a key code.
  It fills `localPlayer().controls` (one plain record per pilot, shape in `src/state/controls.js`)
  and the sim reads that. Step 8c gives each player independent flight, power, drive, shield,
  hull, equipped weapons, cooldowns and locks; `state.player`, `state.flight`, `state.power` and
  related names alias the local record for existing UI and local-only systems. The sim advances
  every active player; shared projectiles and enemies advance once, with AI selecting the nearest.
  The remaining local-only assumptions are listed in `TARGET_ARCHITECTURE.md` for step 9.
  Do not rename fields without saying so there: `steer {x,y}`, `roll`, `thrust`, `strafe`, `lift`,
  `stop`, `brake`, `boost`, `fire`, `sec`. Step 8b puts it on each player; step 16 will fill a
  guest's copy from the network. `tests/layers.test.mjs` fails if a `sim/` file mentions
  `keys`/`pointer`, or if `HELD` sets a field the record does not have.
- **The sim never plays a sound itself.** It emits `sfx { name, ...rest }` at the moment the
  sound belongs to, and `core/audio.js` plays the matching entry of its `SFX` table (one entry per
  sound, holding the exact `tone()`/`nz()` numbers). `tests/layers.test.mjs` fails if a `sim/` file
  imports `core/audio.js`, and also if the sim emits a name with no `SFX` entry (or the table holds
  one nothing emits). To add a sound: an `SFX` entry plus an `emit` — see HOW_TO_ADD.md recipe 9.
  Mute and pause are handled inside `tone()`/`nz()` as before. UI sounds go through `uiSound()`
  and `hoverSound()`, which the screens call directly (they are not game sounds).
- **Text shown to the player** is written inline in the screen or action that shows it.
- **Save changes** follow the rules in "Save compatibility" below.

## Events

Systems talk through `util/events.js` instead of importing each other. The
current events and their payloads are listed at the top of that file. To react
to gameplay from a new feature, subscribe with `on(name, handler)`. For example:

```js
import { on } from "../util/events.js";
on("enemy-killed", ({ def, faction, id }) => { /* achievements, faction reputation, ... */ });
```

If you add an event, add it to the list at the top of `util/events.js` in the same change.

## State

- Saved state is split in two since step 9, carries the current pocket since step 10 and the compact galaxy record since step 11B (`SAVE_VERSION = 18`, `{ v: 18, profile, world }`):
  - `state.profile` is the local pilot's **portable character**: credits (`cr`), flown hull (`ship`), owned hulls (`ships`), per-ship holds (`holds`), per-hull loadouts (`loadout`), hull fractions (`hp`), missile stock (`msl`), selected primary slot (`pw`), active contract (`mission`), kills (`kills`) and completed contracts (`done`). Every player in `state.players` carries its own `player.profile` (`profileOf(player)`).
  - `state.worldState` is the **hosted world**: station-local storage (`stationStores[placeId:featureId]`), the legacy enumerable home alias (`store`), base facility levels (`base`), the station's contract offer board (`board`, aliased by `state.ui.board`), the current pocket id (`place`), the local pilot's resume point (`resume`: null while docked, else `{ pos, quat, sh, en }`) , `destination` (the local system or exact pocket target) and `galaxy: { seed, knowledge }`. Knowledge is compact per-system discovery/visit flags; generated systems/pockets/links are never saved. A legacy v18 save with only `world.store` migrates that stock to its saved station when one exists; v19 remains reserved for Step 13.
  - `currentSave()` and `applySave(save)` join and apply both halves; `portableProfile(save)` and `mergeProfile(save, profile)` extract a guest's character and merge it back into their own save without altering their home world.
  - Both halves are written together on dock, on successful local warp arrival, on every outpost menu action, when the tab is hidden or closed, and every `AUTOSAVE_SECONDS` while playing. `currentSave()` captures the live pilot position first, so every save path records where you actually are.
- Everything else in `state/state.js` (`players`, `places`, `world`, `place`, `time`, `shops`, `ui`, `galaxy`, `galaxyRecovery`, `multiplayer`) is transient session runtime, rebuilt when the game loads. `ui.destination` mirrors saved `world.destination`, is replanned to a reachable system entry or exact pocket, and clears on arrival or Clear; destination changes autosave immediately. The sparse v2 graph changes gate links but preserves seeded system names/positions; removed legacy generated gate saves recover to an ordinary pocket in their old system. `ui.starmap` is the open chart view; `ui.starmapMemory` holds session-only chart presentation across closures, resets on save replacement and follows local cross-system travel in pocket mode; `multiplayer` is the future host flag that keeps the world running while a local chart is open. `state.place`/`state.world` alias the local pilot's pocket; each pilot owns `player.place` and `player.warp`.
- Systems read `state.*` or explicit `(player, profile, world)` parameters directly. There is no hidden global, so tests can build a state object and call a system.

## Replayability hooks

- `util/rng.js`: `random()` is the one random source for the whole game — spawns, loot, asteroid
  ore, the contract board and the audio noise buffers all draw from it. `setSeed(n)` makes a run
  reproducible; `makeRng(n)` gives an independent stream for anything that must be regenerated from
  its own seed.
- `data/contracts.js`: contract generators take a random source, so they can be seeded in the same way.

## Save compatibility

Storage keys (`tr1` for the autosave, `tr_s1`..`tr_s3` for slots) and the `TR1:` code prefix are unchanged from the prototype, so existing saves load. `sanitizeSave` accepts current `{ v: 18, profile, world }` objects, v18 saves without `stationStores` (legacy `world.store` is assigned to the saved station or home), v17 saves (missing `placeMemory` defaults to `{}`), v16 saves, v15 saves (`galaxy:null` becomes the default seed plus home knowledge), v14 saves (no `resume`, so they keep the old dock-or-arrival behaviour), v13 split saves (`world.sector` migrates to `world.place`) and flat v1..v12 saves. Boot, slot load and import call `prepareGalaxySave` first: it installs the saved seed's catalog, validates pocket/knowledge ids against it, and recovers a removed/unknown pocket to the home station with `resume:null` while preserving the whole profile. A failed prepare restores the previous catalog. `world.stationStores` is world state, not portable profile state; its keys are stable `${placeId}:${featureId}` values and its stocks are cleaned through `sanitizeWorld`. `world.placeMemory` stores only positive, finite remaining simulation seconds under each place's `rocks` and `encounters` buckets; it is world state, not portable profile state.

When you change what is saved:

1. Add the field with a default in `newProfile()` (portable character) or `newWorld()` (hosted world).
2. Make `sanitizeProfile()` or `sanitizeWorld()` validate it (clamp numbers, drop unknown ids).
3. Raise `SAVE_VERSION` and add a line to the "Version history" comment in `state/profile.js`, unless the owner has explicitly reserved the next version and the field can be added as an optional backward-compatible extension with a documented migration (as `world.stationStores` does in v18).
4. If an old save needs converting rather than just defaulting, convert it in `sanitizeSave()` / `sanitizeProfile()` / `sanitizeWorld()`.
5. Add a test in `tests/` that loads an old-shaped save.

## Known gaps (things to know before building on top)

The structural gaps (fixed contract count, place memory) are tracked with their fixing step in the "Debt today" table of
[TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md). The list below is the gameplay-level detail.

These are real, current limits. None of them is a bug in play today.

- **Every hull is the same ship apart from the hold today.** Thrusters set speed and turn,
  every hull ships with the same basic drive, and the hull's combat and mining multipliers
  are 1 everywhere. The only difference between hulls is the hold, measured in m³ (one
  cargo unit = 1 m³): Wasp 20 m³, Bulwark 30 m³, Prospector 70 m³. Ship-specific bonuses
  are meant to arrive later as hull attributes; hold size is the one stat being kept.
- **Only a handful of modules exist**: a powerplant, a power cell, basic thrusters, basic
  shields, the basic cannons, the basic mining beam, the basic missiles and the basic hull. They can be
  taken off and fitted again (`sim/fitting.js`, stored in the active station's `world.stationStores` stock). All eight are on sale at
  Meridian (`data/shops.js`): the beam at 900 cr and the missile pod at 1500 cr, and the six
  standard parts at 1 cr each, so a part taken off a hull or lost with a ship can always be
  bought back. There is still only one tier of each part — better versions are new `MODULES`
  entries plus a shop row, not a new system.
  Several things draw power (thrusters 2 MJ/s flying plus boost, shields, guns, the beam
  2 MJ/s cutting), so a basic plant out-produces the trickle and the cells stay near full
  unless the powerplant is removed.
- **Inventory limits.** Only the station's parts can be fitted in Outfitting: a module sitting in a
  ship's hold has to be moved back to the station first. Spare modules can be sold (a spare part is
  an item with a value), but there is no "move everything" button, and fitting in the field is not
  possible. Cargo no longer travels with you between ships: it stays in the ship you
  left it in, and the Base screen's Store/Load/Sell buttons act on the ship being flown.
- **One active contract at a time** (`profile.mission`), and contract tiers are fixed at 1 to 3
  (`generateContract` in `sim/contracts.js`, wording in `ui/screens.js`).
- **Shops and station storage are separate data concerns.** Any number of shops are content entries
  in `data/shops.js` with their own heading, rows, prices and `max` limits, addressed by `shopId`
  everywhere (`shopList`, `buyItem`, `shopStock`, `setShopStock`); limited stock is keyed per shop
  (`"shopId:itemId"` in `state.shops`), so two shops never share a shelf. A station feature in
  `data/places.js` names its shop (`shop`), while `sim/inventory.js` resolves the active station's
  stable `${placeId}:${featureId}` key. Purchases, transfers, sales, fitting, room checks and shop
  presentation all use that station-local stock. Generated traders intentionally reuse Meridian's
  existing `SHOPS` definition and economy rules; they do not share Meridian's inventory. Do not add
  a second hard-coded shop pointer or a place-specific simulation branch.
- **Muting is not saved.** Sound starts on every time the game opens.
- **Where you logged out is saved** (`world.place` + `world.resume`, save v18). A save made while
  docked opens the station menu; a save made in flight returns you to the exact spot and heading,
  with shields and boost as you left them and zero speed. The pocket's arrival point is the fallback
  for older saves, a damaged position, or a ship with no thrusters that would be stranded. Generated
  pockets now resolve one of three data templates with tier-selected encounters: asteroid fields use
  stable field slots, static derelicts/caches become loot crates, and trade lanes can have a dockable
  friendly-trader station using an existing `SHOPS` entry. A field slot or cleared one-shot encounter
  is remembered in `world.placeMemory` and its slow timer advances only on simulation ticks; a
  `respawn-place` event can override it. Station-local inventory is keyed by the dockable station feature and persists in `world.stationStores`.
- **A warp takes the controls for about two seconds, but not the momentum.** The throttle is
  released and the stick eases to neutral (`WARP_COAST` in `data/sectors.js`), so the ship
  coasts down and unwinds its turn; weapons are offline for the whole sequence. Enemies keep
  shooting at you while it charges. Making the ship invulnerable during a warp, or letting
  enemies lose interest, is a deliberate design decision that has not been made yet.
- **The starmap is live and generated pockets are filled.** M opens `ui/starmap.js`: an organic
  system web with gate lines, current/selected markers and zoom/pan/labels; visited knowledge is retained
  without a separate light-blue visual style. Zooming into a selected system dot opens a derived pocket map:
  pockets orbit a visual-only star/black hole with a permanent two-line name/type label. Free systems omit
  internal lines; route-only systems retain them. Gate exit stubs point toward neighbouring systems with blue
  dashed lines and blue remote endpoint dots; their labels are clickable travel targets quoting the reciprocal
  gate pocket, and double-clicking either one opens that peer system map directly. Station pockets render as
  squares and generated trader features/station pockets use deterministic varied names; the right panel stays
  a compact name-only overview. Galaxy pan is bounded to 0.5–1 screen pixels per pointer pixel, increasing
  gently when zoomed out; core radii are map units so system zoom scales the graphic. Pocket names are laid
  out without collisions and crowded labels get a small connector back to their dot. An active destination
  draws solid orange overlays and small directional arrows on galaxy links and local pocket hops; only
  cross-system gate exit stubs are orange dashed, including an incoming stub highlighted in reverse when an
  intermediate system is viewed. Left-clicking a pocket-map pocket is inert; right-clicking a legal local/gate
  pocket or gate-neighbour label opens an adjacent popup with **Set destination** first and **Warp to** only
  when legal. The sim rechecks the quote and emits `travel-denied` on refusal; successful destinations do not
  add the generic bottom confirmation in either map mode. The shared route list shows a small destination
  pocket parenthetical on the final row only for pocket targets. Single-player chart pauses the
  frame gate and suspends audio; `state.multiplayer` is the future host flag that keeps a hosted world running.
  Generated gate traders are removed from gate pockets and receive their own station pocket/internal link;
  explicit `allowStation`, `stationPlacement: "gate"` or feature records can deliberately co-locate one.
  Generated pockets resolve `frontier`, `trade_lane` or `salvage_yard` templates; their tier selects hostile
  patrols, traders, derelicts and caches, and pocket descriptions use the selected template rather than the
  old empty placeholder. Non-empty travel costs are refused until a cost handler exists; fuel,
  activated/proximity gates and supercruise are not implemented.
- **Place memory is persistent simulation state.** `PLACE_DEFS` and generated templates carry station,
  field, spawner, planet and encounter data; runtime containers keep active entities. Stable asteroid
  slots and cleared one-shot encounter feature ids are recorded in `world.placeMemory` with remaining
  simulation seconds (save v18). `sim/place-memory.js` decrements them only from unpaused ticks and
  emits readiness events for `sim/places.js`; `respawn-place` is the future story/event override hook.
  Abandoned crates are still cleared on warp and are not counted as cleared until their encounter's
  final crate is collected.

## Keeping the docs scalable

The docs are read in full by a fresh assistant at the start of every chat, so they have to stay
a size that can be read in one go while still telling the whole story of the project.

- **`CHANGELOG.md` is the memory of the project, and it keeps its history.** It holds the newest
  entries in full and an "Older entries" index with one line per older entry (date and title).
  When it holds more than 15 full entries, move the oldest to the top of `CHANGELOG_ARCHIVE.md`
  until 10 remain, word for word, and add an index line for each one moved. Never delete or
  shorten history, only move it. Do this in the same change that adds a new entry.
- **Write entries so the index line is enough on its own.** The title says what changed and the
  first bullet says why. Put rules that must stay true in this file as well (the conventions
  above), not only in an entry, because entries get archived.
- **This file states how things are now, not how they got there.** When a change replaces an old
  rule, rewrite the rule here instead of adding a second one beside it; the story of the change
  belongs in the changelog. Remove "Known gaps" that have been closed.
- **Names, numbers and file lists that change often belong in one place.** Tuning numbers live in
  `src/data/` and the folder READMEs; avoid repeating them in several docs, because every copy
  has to be updated on every change.
- **If this file or `HOW_TO_ADD.md` passes about 40 KB**, split it by topic (for example
  `docs/CONVENTIONS.md`) and leave a short table of contents with links where the text was.
  Do the split as its own change, with no gameplay changes in it.
- **`HANDOFF.md` is a snapshot, not a log.** Rewrite it (do not append to it) when a chat ends:
  where the game is right now, the standing rules, and what to do next.
