# Architecture: Content and data: randomness, shops, loot, items, enemies, entities

> Part of the code-architecture docs; the index and the layers are in [ARCHITECTURE.md](../ARCHITECTURE.md).
> This describes the code **as it is now**. When a change replaces a rule, rewrite it here.

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

## Known gaps

These are real, current limits. None of them is a bug in play today.

- **Shops and station storage are separate data concerns.** Any number of shops are content entries
  in `data/shops.js` with their own heading, rows, prices and `max` limits, addressed by `shopId`
  everywhere (`shopList`, `buyItem`, `shopStock`, `setShopStock`); limited stock is keyed per shop
  (`"shopId:itemId"` in `state.shops`), so two shops never share a shelf. A station feature in
  `data/places.js` names its shop (`shop`), while `sim/inventory.js` resolves the active station's
  stable `${placeId}:${featureId}` key. Purchases, transfers, sales, fitting, room checks and shop
  presentation all use that station-local stock. Generated traders intentionally reuse Meridian's
  existing `SHOPS` definition and economy rules; they do not share Meridian's inventory. Do not add
  a second hard-coded shop pointer or a place-specific simulation branch.
