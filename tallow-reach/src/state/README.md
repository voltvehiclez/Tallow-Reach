# src/state: runtime state and saves

| File | What it does |
|---|---|
| `state.js` | Runtime `state`: `profile` (local pilot's portable character), `worldState` (hosted world's persistent `store`, `base` and `board`), `players`, `localPlayerIndex`, shared transient `world` and `time`. Each player owns `profile`, controls, flight/lock/cooldowns, power, drive, shield, hull capacity and equipped weapons. `state.player`, `state.controls`, `state.flight`, `state.power`, `state.drive`, `state.shield`, `state.hull`, `state.guns`, `state.beams` and `state.missiles` alias the local player (`ui.board` aliases `worldState.board`). `profileOf(player)`, `currentSave()` and `applySave(save)` connect runtime and save halves. |
| `profile.js` | The saved game (`SAVE_VERSION = 13`): `newProfile()`, `newWorld()`, `newSave()`, `sanitizeProfile()`, `sanitizeWorld()`, `sanitizeSave()`, plus co-op helpers `portableProfile(save)` and `mergeProfile(save, profile)`. Everything that is saved goes through here. |
| `storage.js` | Autosave (`tr1`), three save slots (`tr_s1`..`tr_s3`) and text save codes (`TR1:`), storing `{ v: 13, profile, world }` while transparently migrating older flat saves. Storage keys must not change. |

Rules:
- Changing saved data means: default in `newProfile` or `newWorld`, validation in `sanitizeProfile` or `sanitizeWorld` (invoked by `sanitizeSave`), bump `SAVE_VERSION`, a "Version history" line, and a test. See `docs/ARCHITECTURE.md`.
- `sanitizeWorld` walks `BASE_MODULES` (`data/station.js`) automatically; `sanitizeProfile` validates `msl` against fitted launcher capacity.
- Groups added in a later version (thrusters in v5, shields in v6, cannons in v7, hull in v10) are retrofitted by `cleanLoadouts` for older saves; a save of the current version keeps a bay the player emptied.
- `profile.holds[shipId]` is each ship's own hold (travels with the pilot) and `world.store` (`state.worldState.store`) is the hosted station's storage: both are one stock, `{ itemId: count }` (save v12 unified stocks; save v13 split pilot holds from station storage). No empty counts are kept.
- `profile.loadout` holds the modules fitted to each hull: group id -> one entry per bay (`null` = empty). Only `sim/fitting.js` writes it. `cleanLoadouts` drops unknown ids and bays past the hull's layout, and gives a hull with no saved loadout the stock fit. `cleanStock` keeps a place to known items, whole counts above zero.

