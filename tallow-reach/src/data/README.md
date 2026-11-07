# src/data: tuning and content tables

Plain objects and numbers only. No imports from other layers (except other data files). Safe to edit for balance.

| File | What it holds |
|---|---|
| `ships.js` | Hulls the player can fly, and the `FLIGHT` table that scales every ship at once. A hull has no `spd`/`turn` and no Hull HP of its own: the fitted thrusters set speed and turn (`sim/drive.js`), the fitted shields set shield strength and recharge (`sim/shield.js`), the fitted hull module sets Hull HP (`sim/hull.js`), and an empty thruster bay means the ship cannot move. |
| `items.js` | `ITEMS`: the whole item catalogue — every ore, salvage good and **module**, keyed by id, with a category (`cat`), sell value (`v`), volume in m³ (`vol`) and stack rule (`st`). A module's entry is only `{ cat: "module" }`: its name, volume and stats live in `modules.js` under the same id (`npm test` checks both directions). Adding an item is one line; read them through `itemName`/`itemVol`/`itemValue`/`canSell`/`isModule`, never by hand. |
| `weapons.js` | The missile's flight and lock-on numbers and the ammunition price (`unitPrice`). Guns, the mining beam and the missile launcher are modules (`data/modules.js`), not weapon data. |
| `shops.js` | `SHOPS`: what each shop sells and charges. Per shop a heading (`n`), its line of explanation (`d`), `kit` (standard-issue parts shown as Owned, not sold) and `stock` — one row per item: `id` from `items.js`, `price`, the row's own `n`/`d`, and optionally `max` (leave it out: never runs out; a number: `N left`, sells out). Optional `own: false` hides the "You own N" count. `OUTPOST_SHOP` names the outpost's shop. Bought through `sim/economy.js` `buyItem(shopId, itemId, qty)`. |
| `station.js` | Base modules, their costs, storage and refinery numbers, repair and recovery fees. |
| `contracts.js` | Contract types, generators, wording (`DESCRIBE`), board size. |
| `sectors.js` | The regions you can fly in, their flags, the order M warps through them, and the warp timing (`WARP`). |
| `outfitting.js` | `MODULE_GROUPS` (name and description per bay group), `SHIP_LAYOUTS` (how many bays each hull has of each group), `layoutFor`/`slotsFor`, and `APPEARANCE_SLOTS` (the paint bays under the hull). |
| `enemies.js` | `ENEMIES`: every hostile, keyed by id — name (`n`), plural name (`pl`), Hull HP (`hp`), colour (`col`), scale, faction (`f`), behaviour (`ai`) and all its numbers (speeds, ranges, fire gap, damage, bullet speed, spawn distance). `DEFAULT_ENEMY` is what the spawner falls back to; `enemyDef(id)` looks one up. Adding an enemy is an entry here. |
| `loot.js` | `LOOT_TABLES`: what a kill drops (`kind: "drops"` — a line per drop with a chance `w`, a count range `c` and a scatter `j`) and the ore a rock is made of (`kind: "pick"` — weighted `w`). Rolled by `sim/loot.js`; an enemy names its table with `loot`. `DEFAULT_LOOT` is the fallback. |
| `factions.js` | `FACTIONS`: who a hostile belongs to (`pirates` today), with a name and a description. An enemy names one with its `f` field and the id travels with the `enemy-killed` event. |
| `modules.js` | `MODULES`: every part that can sit in a bay (`g` group, `vol` m³ it takes in a hold or in storage, `n`, `d`, and the stat it feeds: `mjps`, `mj`, `spd`/`turn`, for thrusters the power appetite `draw`/`boost`/`ign` and the boost tank `bmax`/`buse`/`bfill`, for shields `sh`/`regen`/`delay`/`draw`/`drain`, and for the hull `hp`, and for primary weapons `dmg`/`rate`/`bspd`/`draw` plus `barrels` for linked multi-barrel guns). `STOCK_FIT`: what a hull is delivered with. |

Rules:
- Keep the short keys (`n` name, `d` description, `v` value, ...). Copy an existing entry when adding one.
- `npm test` (`tests/content.test.mjs`) fails if an entry is missing a field.
- Adding a ship, item or contract type: see `docs/HOW_TO_ADD.md` recipes 1 to 3.
- A module needs an entry in `items.js` as well as `modules.js` (recipe 16 step 1), and a row in
  `shops.js` if the player should be able to buy one (recipe 4).
