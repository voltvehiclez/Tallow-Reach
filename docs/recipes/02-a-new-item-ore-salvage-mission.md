# Recipe 2: A new item: ore, salvage, mission object or trade good

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data only.


Every item lives in `ITEMS` in `src/data/items.js`. One line is all it takes:

```js
voidglass: { n: "Void glass", cat: "salvage", v: 120, vol: 2 },
```

- `n` name (the screens use it everywhere), `cat` one of `ITEM_CATEGORIES` (`ore`, `salvage`,
  `mission`, `module`, `ammo`, `consumable`, `trade`), `v` credits a unit sells for (a mission object may
  use `v: 0` and is not sellable), `vol` m³ a unit takes up (1 if you leave it out), `st` most that fit in one stack
  (no limit if you leave it out — nothing uses a limit yet).
- Holds, the station's storage, moving, selling, the Base screen, the Inventory tab and the save all
  read the catalogue, so nothing else changes. Old saves simply have none of it, and `npm test`
  checks the entry is complete.

**Nothing appears in the world on its own.** To make the new item findable:

- *Ore in rocks*: add a weighted line to the `asteroid` table in `src/data/loot.js` (recipe 18), and
  give the ore a glow colour in `spawnAsteroid()` in `src/sim/asteroids.js` — that one line is the
  only place a rock's colour is chosen.
- *Loot from kills*: add a line to a table in `src/data/loot.js` (recipe 18).
- *Mine contracts for a new ore*: add its id to `MINE_ORES` in `src/data/contracts.js`.
- *Sold at the station*: add a row to Meridian in `src/data/shops.js` (recipe 4).
