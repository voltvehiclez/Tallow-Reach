# src/data: tuning and content tables

Plain objects and numbers only. No imports from other layers (except other data files). Safe to edit for balance.

| File | What it holds |
|---|---|
| `ships.js` | Hulls the player can fly, and the `FLIGHT` table that scales every ship at once. A hull has no `spd`/`turn` and no Hull HP of its own: the fitted thrusters set speed and turn (`sim/drive.js`), the fitted shields set shield strength and recharge (`sim/shield.js`), the fitted hull module sets Hull HP (`sim/hull.js`), and an empty thruster bay means the ship cannot move. |
| `items.js` | Cargo types and base sell values. |
| `weapons.js` | The missile's flight and lock-on numbers, the ammunition price (`unitPrice`), and the Shop list (`SHOP_WEAPONS`). Guns, the mining beam and the missile launcher are modules (`data/modules.js`), not weapon data. |
| `station.js` | Base modules, their costs, storage and refinery numbers, repair and recovery fees. |
| `contracts.js` | Contract types, generators, wording (`DESCRIBE`), board size. |
| `sectors.js` | The regions you can fly in, their flags, the order M warps through them, and the warp timing (`WARP`). |
| `outfitting.js` | `MODULE_GROUPS` (name and description per bay group), `SHIP_LAYOUTS` (how many bays each hull has of each group), `layoutFor`/`slotsFor`, and `APPEARANCE_SLOTS` (the paint bays under the hull). |
| `modules.js` | `MODULES`: every part that can sit in a bay (`g` group, `vol` m³ it takes in a hold or in storage, `n`, `d`, and the stat it feeds: `mjps`, `mj`, `spd`/`turn`, for thrusters the power appetite `draw`/`boost`/`ign` and the boost tank `bmax`/`buse`/`bfill`, for shields `sh`/`regen`/`delay`/`draw`/`drain`, and for the hull `hp`, and for primary weapons `dmg`/`rate`/`bspd`/`draw` plus `barrels` for linked multi-barrel guns). `STOCK_FIT`: what a hull is delivered with. |

Rules:
- Keep the short keys (`n` name, `d` description, `v` value, ...). Copy an existing entry when adding one.
- `npm test` (`tests/content.test.mjs`) fails if an entry is missing a field.
- Adding a ship, item or contract type: see `docs/HOW_TO_ADD.md` recipes 1 to 3.
