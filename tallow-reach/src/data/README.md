# src/data: tuning and content tables

Plain objects and numbers only. No imports from other layers (except other data files). Safe to edit for balance.

| File | What it holds |
|---|---|
| `ships.js` | Hulls the player can fly. Every key is explained at the top of the file. |
| `items.js` | Cargo types and base sell values. |
| `weapons.js` | Cannon, mining beam, missile numbers, and the Shop list (`SHOP_WEAPONS`). |
| `station.js` | Base modules, their costs, storage and refinery numbers, repair and recovery fees. |
| `contracts.js` | Contract types, generators, wording (`DESCRIBE`), board size. |

Rules:
- Keep the short keys (`n` name, `d` description, `v` value, ...). Copy an existing entry when adding one.
- `npm test` (`tests/content.test.mjs`) fails if an entry is missing a field.
- Adding a ship, item or contract type: see `docs/HOW_TO_ADD.md` recipes 1 to 3.
