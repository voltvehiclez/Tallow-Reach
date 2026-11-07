# src/state: runtime state and saves

| File | What it does |
|---|---|
| `state.js` | The single runtime `state` object (player, world lists, flight, ui, hud, `power`, `drive`, `shield`; `power.use` says who is drawing what). Also `msg()` and `say()` for on-screen text. |
| `profile.js` | The saved game: `newProfile()`, `sanitizeProfile()`, `SAVE_VERSION`. Everything that is saved goes through here. |
| `storage.js` | Autosave, three save slots and text save codes. Storage keys must not change. |

Rules:
- Changing saved data means: default in `newProfile`, validation in `sanitizeProfile`, bump `SAVE_VERSION`, a "Version history" line, and a test. See `docs/ARCHITECTURE.md`.
- `sanitizeProfile` names the base modules and weapon flags explicitly. A new one needs a line there.
- Groups added in a later version (thrusters in v5, shields in v6) are retrofitted by `cleanLoadouts` for older saves; a save of the current version keeps a bay the player emptied.
- `profile.holds[shipId]` is each ship's own hold and `profile.store` is the station's storage: both are one stock, `{ itemId: count }` (save version 12; ore, salvage and spare modules together, priced and sized by `data/items.js`). No empty counts are kept, and there is no separate `profile.modules` any more.
- `profile.loadout` holds the modules fitted to each hull: group id -> one entry per bay (`null` = empty). Only `sim/fitting.js` writes it. `cleanLoadouts` drops unknown ids and bays past the hull's layout, and gives a hull with no saved loadout the stock fit. `cleanStock` keeps a place to known items, whole counts above zero. Bump `SAVE_VERSION` when the shape changes, and convert saves from before it in `sanitizeProfile` (v12 pours the old `store`+`modules` lists and each hold's `cargo`+`modules` into one stock).
