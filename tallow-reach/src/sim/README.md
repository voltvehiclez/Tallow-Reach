# src/sim: gameplay rules

Rules of the game. Reads and changes `state`, talks to other systems with events. Imports `data/`,
`state/` and `util/`. **It holds no mesh, no material and no scene** (refactor steps 7a and 7b): an
enemy, a bullet, a missile, a crate, a spark, a rock and the player's own ship are plain records, and
`render/views.js` draws them. Step 7c removes the remaining render imports: sector entry
emits `sector-entered`, and missile lock reads the camera direction supplied in `state.aimDirection`
by the frame loop. Named weapon mounts come from `data/mounts.js`, transformed by `pilot.js`.
**It never touches the speakers or the keyboard:** a sound is `emit("sfx", { name })` (played by the
`SFX` table in `core/audio.js`) and the pilot's intent arrives in `state.controls` (filled by
`core/input.js`, shape in `state/controls.js`). `tests/layers.test.mjs` keeps all of that true.

| File | What it does |
|---|---|
| `step.js` | `stepSim(dt)` runs the gameplay systems in order; `createSimClock()` feeds it 60 fixed ticks per simulated second and caps long frames. |
| `player.js` | Ship setup (`setShip`), flight model and `hurt()` (shields absorb first, then the hull; the saved fraction `profile.hp[ship]` is stamped on every hull hit). A ship with no drive gets no thrust and no turn, and pressing a control warns "Equip thrusters to move". |
| `shield.js` | The ship's shields from the fitted module: `shieldOf` a loadout, `refreshShield` after a fit, ship change, load or dock, `updateShield` each frame (off while being hit, then `regen` a second after the `delay` lull). Also charges the ship a flat `shieldDraw` MJ/s for keeping them up, and bleeds them away when the ship cannot pay. |
| `power.js` | Ships' power budget: `powerOf` a loadout, `refreshPower`/`refillPower` after a fit change, `updatePower` each frame, and `hasPower` to ask whether the ship can pay for a demand. Writes `state.power` for the HUD; `draw` is set by the thrusters in `sim/player.js`, the shields in `sim/shield.js`, the guns and the beam in `sim/weapons.js`. |
| `hull.js` | The Hull HP the fitted hull module grants (`hull_basic`: `hp` 10) and `refreshHull()` after a fit change, a ship change, a save load or a dock. No module fitted means no Hull HP — any hit reaching the hull kills the ship. The saved fraction in `profile.hp[ship]` is applied; nothing here repairs. |
| `drive.js` | The ship's drive: `driveOf` a loadout, `refreshDrive` after a fit, ship change or undock, `hasDrive` to ask whether the ship can move at all. Writes `state.drive = { spd, turn, draw, boost, ignite, bmax, buse, bfill }` and sizes the boost tank (`player.enMax`), which the flight model and the chase camera read; `driveDraw` works out the per-second power the pilot is asking the thrusters for, and `ignite` is the one-off slug for lighting the boost. No thruster fitted gives 0 / 0: no thrust, turn or boost. |
| `fitting.js` | Moving modules between bays and the station's stock: `fitModule`, `unequip`, `storedFor`, `fittedAt`, `ownedCount`. The only writer of `profile.loadout`; refreshes power, drive, shields and guns after every change. |
| `inventory.js` | Where things are kept and how full it is, in m³. A place is one stock, `{ itemId: count }` — the station (`profile.store`) and each ship's hold (`profile.holds[id]`), ore and spare modules alike, because both are items (`data/items.js`). `stockOf`/`holdOf` (a place), `countOf`/`itemsAt`/`unitsOf` (what is there, in the order the screens list it), `loadOf`/`capacityOf`/`freeOf`/`spaceFor` (room, from each item's `vol`), `addItem`/`takeItem`/`moveItem` (the only movers), `buyItem` (a purchase into the station), `valueOf` (what a stock sells for, with the refinery bonus). Pure: no 3D, so it is tested. |
| `guns.js` | The guns in the primary bays: `gunsOf` a loadout (pure, one `{i, id, dmg, rate, speed, draw, barrels}` per fitted gun) and `beamsOf` (the beam modules there, with `period`/`range`/`draw`), `refreshGuns` after a fit, ship change, load or dock, and `moduleListName` — the short name for a fitted list that the HUD and the equip toast share. Own module so `fitting.js`/`economy.js` can refresh the guns without importing the shooting code. |
| `weapons.js` | Firing the fitted guns on left click (each gun on its own 1/`rate` cooldown, one bolt per linked barrel per shot, drawing `draw` MJ/s while the trigger is held), the mining beam (per fitted `beam_basic` module: `period` seconds of continuous contact per ore, `range`, resetting the moment contact stops), missiles and lock-on (per the fitted `missile_basic` module: `dmg`, `cap`, `cd`; the missile's own flight and lock mechanics come from `data/weapons.js`). Re-exports `gunsOf`/`refreshGuns`. |
| `combat.js` | Bullets, hostile kills, crates and pickups — all plain records (step 7b): a bullet `{ id, kind: "bullet", pos, quat, v, own, dmg, l }`, a crate `{ id, kind: "crate", pos, quat, t, item, spin }`. What a kill drops comes from the enemy's table in `data/loot.js`; a crate carries the item id it holds. |
| `ai.js` | Hostiles: `spawnEnemy(id, pos)` builds one from its def in `data/enemies.js` (name, Hull HP, colour, scale, faction, every number) and `AI_BEHAVIOURS` holds the ways they fight (`chase`: close in, then circle and shoot). `updateEnemies` runs them and the spawner that brings them in. The record itself, and every access to "where is it, which way does it point", is `enemy.js`. |
| `enemy.js` | A hostile as **plain data** (step 7a): `{ id, kind: "enemy", def, n, f, loot, hp, mx, pos, quat, v, fire, o }`. `enemyPos`, `enemyFwd`, `turnEnemy`, `enemyDist`, `enemyVel` are the only ways to read its position and rotation; `dropEnemy(e)` takes it out of the world and emits `enemy-removed`. It holds **no mesh** — `render/views.js` draws it. |
| `loot.js` | Rolls the tables in `data/loot.js`: `rollLoot(id, rng)` returns drops `{ item, count, scatter }`, `pickLoot(id, rng)` returns one weighted item id. Pure (no screen, no state), so it is tested by rolling tables 10,000 times. |
| `asteroids.js` | The asteroid field. A rock is a record (step 7b): `{ id, kind: "rock", sector, shape, pos, quat, s0, scale, r, type, ore, max }` — `s0` is its born size, `scale` its drawn size (mining shrinks it, and the collision rule reads it), `shape` which lumpy model. Its ore comes from the `asteroid` table in `data/loot.js`. `ROCK_SHAPE_COUNT` is how many shapes exist. |
| `targeting.js` | Target lock (F). |
| `economy.js` | Cargo, storage, selling, repairs, every purchase. The outpost's one purchase is `buyItem(shopId, itemId, qty)` — the shop is data (`data/shops.js`) and everything it buys lands in the station's inventory through `inventory.js`; `shopList(shopId)` is what the Shop tab draws, and `shopStock()`/`setShopStock()` hold how much a limited row has left (session state, the hook a restock will use). `sellHold()`/`sellStored()` sell everything with a value in a hold or the station — goods **and** spare modules — and return what they sold; `sellInventoryItem(id, where, n)` sells part of one stack. A fitted part is in no stock, so it is never sold. Returns optional message text. |
| `contracts.js` | Offer board and event-driven progress tracking. |
| `session.js` | Launch, dock, die. Emits `launched`, `docked`, `died`. |
| `sectors.js` | Warping between sectors (M): swaps the scenery and the rock list. Emits `sector-changed`. |
| `effects.js` | Cosmetic explosions and exhaust, as records: `{ id, kind: "fx", pos, v, l, t, col, size }`. Colour and size are data, so the view needs to invent nothing. |
| `world.js` | Sector layout constants, `clearTransient()` (docking: hostiles, shots, missiles and sparks) and `clearWorldObjects()` (warping and loading: crates and sparks as well; rocks stay, they are the sector's). |
| `entity.js` | **Every entity except a hostile and the pilot's ship** goes in and out of the world here (step 7b): `addEntity(list, e)` gives it an id from `util/ids.js` and emits `entity-spawned { id, kind }`, `dropEntity(list, e)` emits `entity-removed`, `clearEntities(list)` empties one. One place, so a view can never miss one. |
| `pilot.js` | Where the player's ship is (step 7b): `playerPos`, `playerFwd`, `playerDist`, `setPlayerPos`, `facePlayer`, `playerVel`, `playerLocal`, `shipScale`. The ship is `state.player.pos` / `.quat`; `playerMount` resolves named mounts; `playerLocal` builds a point in the hull's own frame by hand (pos + scale + quat), never from `matrixWorld`. This is how muzzles, the missile rail, the beam and the chase camera find the ship. |
| `missile.js` | A missile as a record `{ id, kind: "missile", pos, quat, d, sp, t, l, dmg }`: `launchMissile`, `updateMissileFlight`, and the hit that makes it explode. It homes on the hostile it locked (`t`). |

Rules:
- Use `emit`/`on` to connect systems that should not know each other.
- Never import `core/audio.js`: emit `sfx` (see `docs/HOW_TO_ADD.md` recipe 9).
- Never read `keys`/`pointer` or `core/input.js`: read `state.controls` (recipe 8b).
- Never call `Math.random()`. Use `random()` from `util/rng.js`, so `setSeed(n)` makes a whole run
  repeat; `tests/rng.test.mjs` fails if `Math.random` appears in this folder.
- New rules that need numbers: put the numbers in `src/data/`.
- `docs/HOW_TO_ADD.md` recipes 3, 4, 6, 10, 11 touch this folder.
